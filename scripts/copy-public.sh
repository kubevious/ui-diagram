#!/bin/bash
MY_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
MY_DIR="$(dirname $MY_PATH)"

echo '**************************************************'
echo '*** Running @kubevious/ui-diagram Post Install ***'
echo '**************************************************'

echo "CURRENT DIR: ${PWD}"
echo "MY_DIR: ${MY_DIR}"
