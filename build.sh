#!/bin/bash

# Criar diretório de build
mkdir -p build

# Copiar arquivos necessários
cp server.js package.json package-lock.json build/ 2>/dev/null || true

# Copiar frontend se existir
if [ -d "frontend" ]; then
    cp -r frontend build/
    # Instalar dependências do frontend
    cd frontend
    npm install
    npm run build
    cd ..
fi

# Copiar public se existir
if [ -d "public" ]; then
    cp -r public build/
fi

# Criar diretórios necessários
mkdir -p build/uploads

# Instalar dependências do backend
cd build
npm install --production

# Criar arquivo de start
cat > start.sh << 'EOF'
#!/bin/bash
# Preservar variáveis de ambiente existentes
if [ -f .env ]; then
    source .env
fi

# Iniciar o servidor
node server.js
EOF

chmod +x start.sh

# Compactar para envio
cd ..
tar -czf xlsx-manage.tar.gz build/

echo "Build concluído! Arquivo xlsx-manage.tar.gz criado."
echo "Envie este arquivo para o SaveInCloud e execute os seguintes comandos:"
echo "1. tar -xzf xlsx-manage.tar.gz"
echo "2. cd build"
echo "3. ./start.sh" 