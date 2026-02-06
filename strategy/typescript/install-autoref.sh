#!/bin/bash

# Script de instalación y compilación del AutoRef

echo "==================================="
echo "AutoRef - Script de Instalación"
echo "==================================="

# Verificar si npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    echo "Instalando npm..."
    sudo apt update
    sudo apt install -y npm
fi

# Ir al directorio de TypeScript
cd /root/framework/strategy/typescript

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npm run build

echo ""
echo "✅ AutoRef instalado correctamente"
echo ""
echo "Próximos pasos:"
echo "1. Abre Ra (la interfaz gráfica)"
echo "2. Ve a la sección de AutoRef (tercera estrategia)"
echo "3. Carga el archivo: strategy/typescript/autoref-init.ts"
echo "4. Habilita 'Use Internal Referee' y 'Use Internal AutoRef'"
echo ""
echo "Para más información, lee: AUTOREF_README.md"
