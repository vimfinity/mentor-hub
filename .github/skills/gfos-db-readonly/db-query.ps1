param(
    [string]$Profile,
    [Parameter(Mandatory = $false)]
    [string]$Query,
    [int]$MaxRows = 200,
    [switch]$AsJson,
    [switch]$ListProfiles
)

$ErrorActionPreference = 'Stop'
$script:SkillRoot = Split-Path -Parent $PSCommandPath

function Get-ProfileConfig {
    $profileFile = Join-Path $script:SkillRoot 'profiles.json'
    if (-not (Test-Path -LiteralPath $profileFile)) {
        throw "profiles.json not found at $profileFile"
    }

    Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
}

function Resolve-Profile {
    param(
        [object]$Config,
        [string]$RequestedProfile
    )

    $resolvedName = $RequestedProfile
    if ([string]::IsNullOrWhiteSpace($resolvedName)) {
        $resolvedName = $Config.defaultProfile
    }

    foreach ($candidate in $Config.profiles) {
        if ($candidate.name -eq $resolvedName) {
            return $candidate
        }

        foreach ($alias in @($candidate.aliases)) {
            if ($alias -eq $resolvedName) {
                return $candidate
            }
        }
    }

    $available = ($Config.profiles | ForEach-Object { $_.name }) -join ', '
    throw "Unknown profile '$resolvedName'. Available profiles: $available"
}

function Get-XmlNodesByLocalName {
    param(
        [System.Xml.XmlNode]$Node,
        [string]$LocalName
    )

    @($Node.SelectNodes(".//*[local-name()='$LocalName']"))
}

function Get-DirectChildNodesByLocalName {
    param(
        [System.Xml.XmlNode]$Node,
        [string]$LocalName
    )

    @($Node.SelectNodes("./*[local-name()='$LocalName']"))
}

function Resolve-DatasourceFromXml {
    param(
        [string]$ConfigPath,
        [string]$JndiName
    )

    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw "Datasource config not found: $ConfigPath"
    }

    [xml]$xml = Get-Content -LiteralPath $ConfigPath -Raw
    $datasources = Get-XmlNodesByLocalName -Node $xml -LocalName 'datasource'
    $datasource = $datasources | Where-Object { $_.GetAttribute('jndi-name') -eq $JndiName } | Select-Object -First 1

    if (-not $datasource) {
        throw "Datasource '$JndiName' not found in $ConfigPath"
    }

    $properties = @{}
    foreach ($property in (Get-DirectChildNodesByLocalName -Node $datasource -LocalName 'connection-property')) {
        $properties[$property.GetAttribute('name')] = $property.InnerText.Trim()
    }

    $security = $datasource.SelectSingleNode("./*[local-name()='security']")
    if (-not $security) {
        throw "Security block missing for datasource '$JndiName' in $ConfigPath"
    }

    [pscustomobject]@{
        ServerName = $properties['ServerName']
        InstanceName = $properties['instanceName']
        DatabaseName = $properties['DatabaseName']
        Encrypt = $properties['encrypt']
        TrustServerCertificate = $properties['trustServerCertificate']
        ApplicationName = $properties['ApplicationName']
        UserName = $security.GetAttribute('user-name')
        Password = $security.GetAttribute('password')
        JndiName = $datasource.GetAttribute('jndi-name')
    }
}

function Test-ReadOnlyQuery {
    param([string]$Sql)

    if ([string]::IsNullOrWhiteSpace($Sql)) {
        throw 'Query is required.'
    }

    $trimmed = $Sql.Trim().TrimEnd(';').Trim()
    if ($trimmed -notmatch '^(?is)select\b') {
        throw 'Only a single SELECT statement is allowed.'
    }

    if ($trimmed -match ';') {
        throw 'Multiple statements are not allowed.'
    }

    if ($trimmed -match '(?is)\b(insert|update|delete|merge|truncate|alter|drop|create|exec(?:ute)?|grant|revoke)\b') {
        throw 'Write or DDL keywords are not allowed.'
    }

    return $trimmed
}

function Add-TopLimit {
    param(
        [string]$Sql,
        [int]$Limit
    )

    if ($Limit -le 0) {
        return $Sql
    }

    if ($Sql -match '(?is)^\s*select\s+distinct\s+top\s*\(' -or $Sql -match '(?is)^\s*select\s+top\s*\(' -or $Sql -match '(?is)^\s*select\s+top\s+\d+') {
        return $Sql
    }

    if ($Sql -match '^(?is)(\s*select\s+distinct\b)(.*)$') {
        return "$($Matches[1]) TOP ($Limit)$($Matches[2])"
    }

    if ($Sql -match '^(?is)(\s*select\b)(.*)$') {
        return "$($Matches[1]) TOP ($Limit)$($Matches[2])"
    }

    return $Sql
}

function Convert-TableToRows {
    param([System.Data.DataTable]$Table)

    $rows = @()
    foreach ($row in $Table.Rows) {
        $item = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $item[$column.ColumnName] = $row[$column.ColumnName]
        }
        $rows += [pscustomobject]$item
    }

    $rows
}

function New-Result {
    param(
        [bool]$Ok,
        [string]$Message,
        [object]$ProfileDefinition,
        [object]$Datasource,
        [string]$OriginalQuery,
        [string]$ExecutedQuery,
        [int]$MaxRowsUsed,
        [object[]]$Rows
    )

    $serverInstance = $null
    $databaseName = $null
    if ($Datasource) {
        $serverInstance = if ($Datasource.InstanceName) { "$($Datasource.ServerName)\$($Datasource.InstanceName)" } else { $Datasource.ServerName }
        $databaseName = $Datasource.DatabaseName
    }

    [pscustomobject]@{
        ok = $Ok
        message = $Message
        profile = if ($ProfileDefinition) { $ProfileDefinition.name } else { $null }
        profileDescription = if ($ProfileDefinition) { $ProfileDefinition.description } else { $null }
        configPath = if ($ProfileDefinition) { $ProfileDefinition.configPath } else { $null }
        jndiName = if ($Datasource) { $Datasource.JndiName } else { $null }
        serverInstance = $serverInstance
        database = $databaseName
        queryOriginal = $OriginalQuery
        queryExecuted = $ExecutedQuery
        maxRows = $MaxRowsUsed
        rowCount = @($Rows).Count
        rows = @($Rows)
    }
}

function Write-Result {
    param(
        [object]$Result,
        [switch]$Json
    )

    if ($Json) {
        $Result | ConvertTo-Json -Depth 6
        return
    }

    Write-Output ("Status      : " + $(if ($Result.ok) { 'OK' } else { 'ERROR' }))
    Write-Output ("Profile     : " + $Result.profile)
    Write-Output ("Server      : " + $Result.serverInstance)
    Write-Output ("Database    : " + $Result.database)
    Write-Output ("Rows        : " + $Result.rowCount)
    Write-Output ("MaxRows     : " + $Result.maxRows)
    Write-Output ("Message     : " + $Result.message)
    if ($Result.queryExecuted) {
        Write-Output ("Query       : " + $Result.queryExecuted)
    }
    if ($Result.rows -and $Result.rows.Count -gt 0) {
        $Result.rows | Format-Table | Out-String -Width 260 | Write-Output
    }
}

$config = Get-ProfileConfig

if ($ListProfiles) {
    $profiles = $config.profiles | Select-Object name, description, configPath, jndiName
    if ($AsJson) {
        $profiles | ConvertTo-Json -Depth 4
    } else {
        $profiles | Format-Table | Out-String -Width 260 | Write-Output
    }
    exit 0
}

$selectedProfile = $null
$datasource = $null

try {
    $selectedProfile = Resolve-Profile -Config $config -RequestedProfile $Profile
    $datasource = Resolve-DatasourceFromXml -ConfigPath $selectedProfile.configPath -JndiName $selectedProfile.jndiName
    $validatedQuery = Test-ReadOnlyQuery -Sql $Query
    $effectiveQuery = Add-TopLimit -Sql $validatedQuery -Limit $MaxRows

    Add-Type -AssemblyName System.Data

    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $builder['Data Source'] = if ($datasource.InstanceName) { "$($datasource.ServerName)\$($datasource.InstanceName)" } else { $datasource.ServerName }
    $builder['Initial Catalog'] = $datasource.DatabaseName
    $builder['User ID'] = $datasource.UserName
    $builder['Password'] = $datasource.Password
    $builder['Connect Timeout'] = 15
    $builder['TrustServerCertificate'] = [System.Convert]::ToBoolean($datasource.TrustServerCertificate)
    $builder['Encrypt'] = [System.Convert]::ToBoolean($datasource.Encrypt)
    if ($datasource.ApplicationName) {
        $builder['Application Name'] = $datasource.ApplicationName
    }

    $connection = New-Object System.Data.SqlClient.SqlConnection $builder.ConnectionString
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = $effectiveQuery
        $command.CommandTimeout = 30

        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
        $table = New-Object System.Data.DataTable
        [void]$adapter.Fill($table)

        $rows = Convert-TableToRows -Table $table
        $result = New-Result -Ok $true -Message 'Query executed successfully.' -ProfileDefinition $selectedProfile -Datasource $datasource -OriginalQuery $validatedQuery -ExecutedQuery $effectiveQuery -MaxRowsUsed $MaxRows -Rows $rows
        Write-Result -Result $result -Json:$AsJson
    }
    finally {
        if ($connection.State -eq [System.Data.ConnectionState]::Open) {
            $connection.Close()
        }
    }
}
catch {
    $result = New-Result -Ok $false -Message $_.Exception.Message -ProfileDefinition $selectedProfile -Datasource $datasource -OriginalQuery $Query -ExecutedQuery $null -MaxRowsUsed $MaxRows -Rows @()
    Write-Result -Result $result -Json:$AsJson
    exit 1
}
