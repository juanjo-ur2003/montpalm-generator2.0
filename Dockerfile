FROM node:20-slim

# Dependencias del sistema + LibreOffice + herramientas de fuentes
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    wget \
    ca-certificates \
    fontconfig \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Instalar Cormorant Garamond (serif del branding Montpalm)
RUN mkdir -p /usr/share/fonts/truetype/cormorant && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf"    -O /usr/share/fonts/truetype/cormorant/CormorantGaramond-Regular.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Bold.ttf"       -O /usr/share/fonts/truetype/cormorant/CormorantGaramond-Bold.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Italic.ttf"     -O /usr/share/fonts/truetype/cormorant/CormorantGaramond-Italic.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-BoldItalic.ttf" -O /usr/share/fonts/truetype/cormorant/CormorantGaramond-BoldItalic.ttf

# Instalar Jost (sans-serif del branding Montpalm)
RUN mkdir -p /usr/share/fonts/truetype/jost && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/static/Jost-Regular.ttf"    -O /usr/share/fonts/truetype/jost/Jost-Regular.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/static/Jost-Bold.ttf"       -O /usr/share/fonts/truetype/jost/Jost-Bold.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/static/Jost-Italic.ttf"     -O /usr/share/fonts/truetype/jost/Jost-Italic.ttf && \
    wget -q "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/static/Jost-BoldItalic.ttf" -O /usr/share/fonts/truetype/jost/Jost-BoldItalic.ttf

# Registrar todas las fuentes con LibreOffice
RUN fc-cache -fv

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
