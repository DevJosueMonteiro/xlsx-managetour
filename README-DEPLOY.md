# Instruções de Deploy

Este repositório contém os arquivos de deploy do projeto xlsx-Manage divididos em partes.

## Como juntar os arquivos

No servidor (SaveInCloud), execute os seguintes comandos:

```bash
# Baixar todas as partes
wget https://raw.githubusercontent.com/DevJosueMonteiro/xlsx-Manage/main/xlsx-manage.tar.gz.part-*

# Juntar as partes
cat xlsx-manage.tar.gz.part-* > xlsx-manage.tar.gz

# Extrair e executar
tar -xzf xlsx-manage.tar.gz
cd build
./start.sh
```

## Arquivos incluídos
- xlsx-manage.tar.gz.part-aa
- xlsx-manage.tar.gz.part-ab
- xlsx-manage.tar.gz.part-ac
- xlsx-manage.tar.gz.part-ad
- xlsx-manage.tar.gz.part-ae
- xlsx-manage.tar.gz.part-af
- xlsx-manage.tar.gz.part-ag
- xlsx-manage.tar.gz.part-ah 