#!/bin/bash
# Preservar variáveis de ambiente existentes
if [ -f .env ]; then
    source .env
fi

# Iniciar o servidor
node server.js
