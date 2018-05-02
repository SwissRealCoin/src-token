# PowerShell == of init.sh
# export PATH=$PWD/node_modules/.bin:$PATH
# echo $PATH

# @author Matt Swezey <ms@validitylabs.org>

# If "cannot be loaded because running scripts is disabled on this system" run this command in PS: "Set-ExecutionPolicy RemoteSigned"

# Reset Path in same PS session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

$env:Path += ";$PWD\node_modules\.bin"

echo $env:Path
