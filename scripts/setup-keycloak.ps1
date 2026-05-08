#!/usr/bin/env pwsh
# Idempotent Keycloak setup for the OXO HRIS realm.
# Creates: realm, realm roles, oxo-hris-frontend (public, direct-grants),
# oxo-hris-backend (confidential, service-account with manage-users),
# audience mapper scope, one test user.
#
# Usage:
#   pwsh ./setup-keycloak.ps1
# Will prompt for the master-realm admin username and password.

param(
    [string]$KeycloakUrl = 'http://localhost:5400',
    [string]$Realm = 'hris',
    [string]$AdminUser,
    [securestring]$AdminPassword,
    [string]$FrontendClientId = 'oxo-hris-frontend',
    [string]$BackendClientId = 'oxo-hris-backend',
    [string]$BackendClientSecret = '3hJ66BlpzsL95TyLfmNwjrsXcftGrcCf',
    [string[]]$Roles = @(
        'super_admin', 'hr_manager', 'hr_executive',
        'finance_manager', 'finance_executive',
        'employee', 'consultant', 'service_provider'
    ),
    [string]$TestUserEmail,
    [securestring]$TestUserPassword,
    [string]$TestUserRole = 'super_admin'
)

$ErrorActionPreference = 'Stop'

if (-not $AdminUser) {
    $AdminUser = Read-Host -Prompt 'Keycloak master-realm admin username'
}
if (-not $AdminPassword) {
    $AdminPassword = Read-Host -Prompt "Password for $AdminUser" -AsSecureString
}
if (-not $TestUserEmail) {
    $TestUserEmail = Read-Host -Prompt 'Test user email (will be username too)'
}
if (-not $TestUserPassword) {
    $TestUserPassword = Read-Host -Prompt "Password for $TestUserEmail" -AsSecureString
}

$adminPwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminPassword))
$testUserPwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TestUserPassword))

function Get-AdminToken {
    $body = @{
        grant_type = 'password'
        client_id  = 'admin-cli'
        username   = $AdminUser
        password   = $adminPwPlain
    }
    (Invoke-RestMethod -Method Post `
        -Uri "$KeycloakUrl/realms/master/protocol/openid-connect/token" `
        -Body $body -ContentType 'application/x-www-form-urlencoded').access_token
}

$token = Get-AdminToken
$auth  = @{ Authorization = "Bearer $token" }
Write-Host "[ok] Authenticated as $AdminUser" -ForegroundColor Green

# --- Realm -----------------------------------------------------------------
$existingRealm = $null
try {
    $existingRealm = Invoke-RestMethod -Method Get `
        -Uri "$KeycloakUrl/admin/realms/$Realm" -Headers $auth
} catch { }

if ($existingRealm) {
    Write-Host "[skip] Realm '$Realm' already exists" -ForegroundColor Yellow
} else {
    $realmBody = @{ realm = $Realm; enabled = $true } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$KeycloakUrl/admin/realms" `
        -Headers $auth -Body $realmBody -ContentType 'application/json' | Out-Null
    Write-Host "[ok] Created realm '$Realm'" -ForegroundColor Green
}

# --- Realm roles -----------------------------------------------------------
$existingRoles = (Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/roles" -Headers $auth).name
foreach ($r in $Roles) {
    if ($existingRoles -contains $r) {
        Write-Host "[skip] Role '$r'" -ForegroundColor Yellow
    } else {
        $roleBody = @{ name = $r } | ConvertTo-Json
        Invoke-RestMethod -Method Post `
            -Uri "$KeycloakUrl/admin/realms/$Realm/roles" `
            -Headers $auth -Body $roleBody -ContentType 'application/json' | Out-Null
        Write-Host "[ok] Created role '$r'" -ForegroundColor Green
    }
}

# --- Frontend client -------------------------------------------------------
$existingClients = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/clients?clientId=$FrontendClientId" -Headers $auth
if ($existingClients.Count -gt 0) {
    $frontendUuid = $existingClients[0].id
    Write-Host "[skip] Client '$FrontendClientId' already exists" -ForegroundColor Yellow
} else {
    $frontendBody = @{
        clientId                  = $FrontendClientId
        publicClient              = $true
        standardFlowEnabled       = $true
        directAccessGrantsEnabled = $true   # ROPC / password grant
        implicitFlowEnabled       = $false
        serviceAccountsEnabled    = $false
        redirectUris              = @('http://localhost:3000/*')
        webOrigins                = @('http://localhost:3000')
        attributes                = @{
            'pkce.code.challenge.method'    = 'S256'
            'post.logout.redirect.uris'     = 'http://localhost:3000/login'
        }
    } | ConvertTo-Json -Depth 5
    $resp = Invoke-WebRequest -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/clients" `
        -Headers $auth -Body $frontendBody -ContentType 'application/json'
    $frontendUuid = ($resp.Headers.Location -split '/')[-1]
    Write-Host "[ok] Created client '$FrontendClientId'" -ForegroundColor Green
}

# --- Backend client (confidential, service-account) ------------------------
$existingClients = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/clients?clientId=$BackendClientId" -Headers $auth
if ($existingClients.Count -gt 0) {
    $backendUuid = $existingClients[0].id
    Write-Host "[skip] Client '$BackendClientId' already exists" -ForegroundColor Yellow
    # Force the secret to the value we want so backend .env stays in sync
    Invoke-RestMethod -Method Put `
        -Uri "$KeycloakUrl/admin/realms/$Realm/clients/$backendUuid" -Headers $auth `
        -Body (@{ secret = $BackendClientSecret } | ConvertTo-Json) `
        -ContentType 'application/json' | Out-Null
} else {
    $backendBody = @{
        clientId                  = $BackendClientId
        publicClient              = $false
        secret                    = $BackendClientSecret
        standardFlowEnabled       = $false
        directAccessGrantsEnabled = $false
        implicitFlowEnabled       = $false
        serviceAccountsEnabled    = $true
    } | ConvertTo-Json -Depth 5
    $resp = Invoke-WebRequest -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/clients" `
        -Headers $auth -Body $backendBody -ContentType 'application/json'
    $backendUuid = ($resp.Headers.Location -split '/')[-1]
    Write-Host "[ok] Created client '$BackendClientId'" -ForegroundColor Green
}

# Grant manage-users + view-users to the backend's service account
$saUser = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/clients/$backendUuid/service-account-user" -Headers $auth
$realmMgmtClient = (Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/clients?clientId=realm-management" -Headers $auth)[0]
foreach ($needed in @('manage-users', 'view-users')) {
    $role = Invoke-RestMethod -Method Get `
        -Uri "$KeycloakUrl/admin/realms/$Realm/clients/$($realmMgmtClient.id)/roles/$needed" -Headers $auth
    Invoke-RestMethod -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/users/$($saUser.id)/role-mappings/clients/$($realmMgmtClient.id)" `
        -Headers $auth -Body (@($role) | ConvertTo-Json -Depth 5 -AsArray) `
        -ContentType 'application/json' | Out-Null
}
Write-Host "[ok] Backend service account has manage-users + view-users" -ForegroundColor Green

# --- Audience mapper scope -------------------------------------------------
$scopeName = "$BackendClientId-audience"
$existingScopes = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/client-scopes" -Headers $auth
$scope = $existingScopes | Where-Object { $_.name -eq $scopeName }
if (-not $scope) {
    $scopeBody = @{
        name        = $scopeName
        description = "Adds $BackendClientId to the aud claim"
        protocol    = 'openid-connect'
        attributes  = @{
            'include.in.token.scope' = 'true'
            'display.on.consent.screen' = 'false'
        }
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/client-scopes" `
        -Headers $auth -Body $scopeBody -ContentType 'application/json' | Out-Null
    $scope = (Invoke-RestMethod -Method Get `
        -Uri "$KeycloakUrl/admin/realms/$Realm/client-scopes" -Headers $auth) `
        | Where-Object { $_.name -eq $scopeName }
    Write-Host "[ok] Created client scope '$scopeName'" -ForegroundColor Green
} else {
    Write-Host "[skip] Client scope '$scopeName' already exists" -ForegroundColor Yellow
}

# Ensure mapper exists in scope
$mappers = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/client-scopes/$($scope.id)/protocol-mappers/models" -Headers $auth
if (-not ($mappers | Where-Object { $_.name -eq $BackendClientId })) {
    $mapperBody = @{
        name           = $BackendClientId
        protocol       = 'openid-connect'
        protocolMapper = 'oidc-audience-mapper'
        config         = @{
            'included.client.audience' = $BackendClientId
            'id.token.claim'           = 'false'
            'access.token.claim'       = 'true'
        }
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/client-scopes/$($scope.id)/protocol-mappers/models" `
        -Headers $auth -Body $mapperBody -ContentType 'application/json' | Out-Null
    Write-Host "[ok] Added audience mapper to scope" -ForegroundColor Green
} else {
    Write-Host "[skip] Audience mapper already exists" -ForegroundColor Yellow
}

# Bind scope to frontend client as DEFAULT
Invoke-RestMethod -Method Put `
    -Uri "$KeycloakUrl/admin/realms/$Realm/clients/$frontendUuid/default-client-scopes/$($scope.id)" `
    -Headers $auth | Out-Null
Write-Host "[ok] Bound '$scopeName' as default scope on '$FrontendClientId'" -ForegroundColor Green

# --- Test user -------------------------------------------------------------
$existingUsers = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/users?email=$TestUserEmail" -Headers $auth
if ($existingUsers.Count -gt 0) {
    $userId = $existingUsers[0].id
    Write-Host "[skip] User '$TestUserEmail' already exists" -ForegroundColor Yellow
} else {
    $userBody = @{
        username      = $TestUserEmail
        email         = $TestUserEmail
        firstName     = 'Test'
        lastName      = 'User'
        enabled       = $true
        emailVerified = $true
        credentials   = @(@{ type = 'password'; value = $testUserPwPlain; temporary = $false })
    } | ConvertTo-Json -Depth 5
    $resp = Invoke-WebRequest -Method Post `
        -Uri "$KeycloakUrl/admin/realms/$Realm/users" `
        -Headers $auth -Body $userBody -ContentType 'application/json'
    $userId = ($resp.Headers.Location -split '/')[-1]
    Write-Host "[ok] Created test user '$TestUserEmail'" -ForegroundColor Green
}

# Assign role
$roleObj = Invoke-RestMethod -Method Get `
    -Uri "$KeycloakUrl/admin/realms/$Realm/roles/$TestUserRole" -Headers $auth
Invoke-RestMethod -Method Post `
    -Uri "$KeycloakUrl/admin/realms/$Realm/users/$userId/role-mappings/realm" `
    -Headers $auth -Body (@($roleObj) | ConvertTo-Json -Depth 5 -AsArray) `
    -ContentType 'application/json' | Out-Null
Write-Host "[ok] Assigned '$TestUserRole' to '$TestUserEmail'" -ForegroundColor Green

Write-Host ""
Write-Host "==== DONE ====" -ForegroundColor Green
Write-Host "Realm:     $Realm"
Write-Host "Frontend:  $FrontendClientId (public, direct-grants enabled)"
Write-Host "Backend:   $BackendClientId (confidential, service account: manage-users + view-users)"
Write-Host "Test user: $TestUserEmail / role=$TestUserRole"
Write-Host ""
Write-Host "Verify: http://localhost:5400/realms/$Realm/.well-known/openid-configuration"
