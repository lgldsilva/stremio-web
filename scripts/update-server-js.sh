#!/bin/bash

# Cores para o terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Consultando versão atual do Stremio Streaming Server...${NC}"

# 1. Obter a URL da versão mais recente
SERVER_URL_FILE="https://raw.githubusercontent.com/Stremio/stremio-shell/master/server-url.txt"
LATEST_URL=$(wget -qO- "$SERVER_URL_FILE")

if [ -z "$LATEST_URL" ]; then
    echo "Erro: Não foi possível obter a URL do servidor."
    exit 1
fi

echo -e "${BLUE}Versão encontrada: ${LATEST_URL}${NC}"

# 2. Caminho do arquivo local
TARGET_PATH="docker/server.js"

# 3. Download
echo -e "${BLUE}Baixando nova versão...${NC}"
wget "$LATEST_URL" -O "${TARGET_PATH}.tmp"

if [ $? -eq 0 ]; then
    mv "${TARGET_PATH}.tmp" "$TARGET_PATH"
    echo -e "${GREEN}Sucesso! O arquivo ${TARGET_PATH} foi atualizado.${NC}"
    echo -e "${GREEN}Lembre-se de rebuildar sua imagem Docker para aplicar a mudança.${NC}"
else
    echo "Erro ao baixar o arquivo."
    rm -f "${TARGET_PATH}.tmp"
    exit 1
fi
