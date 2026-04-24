FROM node:20-slim

# Instalar LibreOffice + fontconfig
RUN apt-get update && apt-get install -y \
    libreoffice \
    fonts-liberation \
    fontconfig \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Copiar fuentes del branding Montpalm (Cormorant Garamond + Jost)
COPY fonts/ /usr/share/fonts/truetype/montpalm/
RUN fc-cache -fv

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
