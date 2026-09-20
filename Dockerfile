FROM node:18-slim

# llama.cpp'nin indirilmesi ve derlenmesi için gerekli araçları yüklüyoruz
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    cmake \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
