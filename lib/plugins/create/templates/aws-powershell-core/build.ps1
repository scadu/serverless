Install-Module AWSLambdaPSCore -Scope CurrentUser
New-AWSPowerShellLambdaPackage -ScriptPath .\Handler.ps1 -OutputPackage artifact.zip