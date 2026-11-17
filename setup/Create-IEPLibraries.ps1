# Creates the two SharePoint libraries the IEP Builder uses.
# Requires PnP.PowerShell:  Install-Module PnP.PowerShell -Scope CurrentUser
# Usage:  ./Create-IEPLibraries.ps1 -SiteUrl https://evoke.sharepoint.com/sites/SpecialEducation -ClientId <PnP app id>
param(
  [Parameter(Mandatory)] [string] $SiteUrl,
  [Parameter(Mandatory)] [string] $ClientId
)
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

# 1. IEP Records: one JSON file per IEP, with metadata columns (the "database")
New-PnPList -Title "IEP Records" -Template DocumentLibrary -OnQuickLaunch -ErrorAction SilentlyContinue
Add-PnPField -List "IEP Records" -DisplayName "Student Name" -InternalName "StudentName" -Type Text -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "Meeting Date" -InternalName "MeetingDate" -Type DateTime -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "IEP Status" -InternalName "IEPStatus" -Type Choice -Choices "Draft","Final" -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "Case Manager" -InternalName "CaseManager" -Type Text -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "Next IEP Review" -InternalName "NextReviewDate" -Type DateTime -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "Next Reevaluation" -InternalName "NextEligDate" -Type DateTime -AddToDefaultView
Add-PnPField -List "IEP Records" -DisplayName "Caseload Item ID" -InternalName "CaseloadId" -Type Text
Add-PnPField -List "IEP Records" -DisplayName "SASID" -InternalName "SASID" -Type Text
Set-PnPList -Identity "IEP Records" -EnableVersioning $true -MajorVersions 500 -BreakRoleInheritance -CopyRoleAssignments

# 2. IEP Documents: generated Word documents, one folder per student
New-PnPList -Title "IEP Documents" -Template DocumentLibrary -OnQuickLaunch -ErrorAction SilentlyContinue
Set-PnPList -Identity "IEP Documents" -EnableVersioning $true -BreakRoleInheritance -CopyRoleAssignments

Write-Host "Done. Now remove anyone who shouldn't see student records from both libraries' permissions." -ForegroundColor Green
