#!/bin/bash

# Initialize the terminal by the following command:
# $> source ./initShell.sh

export PATH=$PWD/node_modules/.bin:$PATH

# Use correct NodeJS version for this project
nvm install
nvm use

echo $PATH
