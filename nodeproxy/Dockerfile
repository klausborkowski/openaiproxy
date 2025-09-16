# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src/ ./src/

# Создаем пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Меняем владельца файлов
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Открываем порт
EXPOSE 8080

# Определяем переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Проверка здоровья контейнера
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: process.env.PORT || 8080, path: '/healthz', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Запускаем приложение
CMD ["npm", "start"]
