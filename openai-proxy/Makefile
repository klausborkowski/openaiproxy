# Makefile для тестирования OpenAI прокси сервера
# Использование: make <target>

# Переменные конфигурации
PROXY_URL ?= http://localhost:8080
API_KEY ?= sk-your-openai-api-key-here
ADMIN_TOKEN ?= changeme_please

# Docker переменные
DOCKER_IMAGE_NAME ?= openai-proxy
DOCKER_TAG ?= latest
CONTAINER_NAME ?= openai-proxy-server

# Цвета для вывода
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

# Помощь
.PHONY: help
help:
	@echo "$(GREEN)OpenAI Proxy Server - Команды Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)Основные команды:$(NC)"
	@echo "  help                 - Показать эту справку"
	@echo "  health               - Проверить здоровье сервера"
	@echo "  metrics              - Получить метрики сервера"
	@echo "  chat                 - Отправить запрос на chat completion"
	@echo "  chat-stream          - Отправить streaming запрос"
	@echo "  embeddings           - Получить эмбеддинги для текста"
	@echo "  models               - Получить список доступных моделей"
	@echo ""
	@echo "$(YELLOW)Административные команды:$(NC)"
	@echo "  cache-purge-all      - Очистить весь кеш"
	@echo "  cache-purge-key      - Очистить конкретный ключ кеша (KEY=...)"
	@echo ""
	@echo "$(YELLOW)Тестовые команды:$(NC)"
	@echo "  test-rate-limit      - Тестировать ограничение скорости"
	@echo "  test-cache           - Тестировать кеширование"
	@echo "  load-test            - Простой нагрузочный тест"
	@echo ""
	@echo "$(YELLOW)Docker команды:$(NC)"
	@echo "  docker-build         - Собрать Docker образ"
	@echo "  docker-run           - Запустить контейнер"
	@echo "  docker-stop          - Остановить контейнер"
	@echo "  docker-logs          - Посмотреть логи контейнера"
	@echo "  docker-shell         - Войти в контейнер"
	@echo "  docker-clean         - Удалить контейнер и образ"
	@echo "  docker-compose-up    - Запустить через docker-compose"
	@echo "  docker-compose-down  - Остановить docker-compose"
	@echo "  docker-test          - Полный тест: сборка + запуск + тест"
	@echo ""
	@echo "$(YELLOW)Docker exec команды (внутри контейнера):$(NC)"
	@echo "  docker-exec-chat     - Выполнить chat запрос внутри контейнера"
	@echo "  docker-exec-health   - Проверить здоровье изнутри контейнера"
	@echo "  docker-exec-metrics  - Получить метрики изнутри контейнера"
	@echo "  docker-exec-test-all - Запустить все тесты изнутри контейнера"
	@echo "  docker-exec-shell-tools - Войти в контейнер с установленными инструментами"
	@echo ""
	@echo "$(YELLOW)Переменные окружения:$(NC)"
	@echo "  PROXY_URL=$(PROXY_URL)"
	@echo "  API_KEY=$(API_KEY)"
	@echo "  ADMIN_TOKEN=$(ADMIN_TOKEN)"
	@echo "  DOCKER_IMAGE_NAME=$(DOCKER_IMAGE_NAME)"
	@echo "  DOCKER_TAG=$(DOCKER_TAG)"

# Проверка здоровья сервера
.PHONY: health
health:
	@echo "$(GREEN)Проверка здоровья сервера...$(NC)"
	@curl -s -X GET "$(PROXY_URL)/healthz" | jq . || echo "$(RED)Ошибка: сервер недоступен$(NC)"

# Получение метрик
.PHONY: metrics
metrics:
	@echo "$(GREEN)Получение метрик сервера...$(NC)"
	@curl -s -X GET "$(PROXY_URL)/metrics"

# Chat Completion запрос
.PHONY: chat
chat:
	@echo "$(GREEN)Отправка chat completion запроса...$(NC)"
	@curl -s -X POST "$(PROXY_URL)/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "hi!how are you?"}], "max_tokens": 100, "temperature": 0.7}' | jq .

# Streaming Chat Completion
.PHONY: chat-stream
chat-stream:
	@echo "$(GREEN)Отправка streaming chat completion запроса...$(NC)"
	@curl -s -X POST "$(PROXY_URL)/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "tell the story pls?"}], "max_tokens": 150, "temperature": 0.8, "stream": true}'

# Embeddings запрос
.PHONY: embeddings
embeddings:
	@echo "$(GREEN)Получение эмбеддингов...$(NC)"
	@curl -s -X POST "$(PROXY_URL)/v1/embeddings" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "text-embedding-ada-002", "input": "Тестовый текст для эмбеддингов"}' | jq .

# Список моделей
.PHONY: models
models:
	@echo "$(GREEN)Получение списка моделей...$(NC)"
	@curl -s -X GET "$(PROXY_URL)/v1/models" \
		-H "Authorization: Bearer $(API_KEY)" | jq .

# Очистка всего кеша
.PHONY: cache-purge-all
cache-purge-all:
	@echo "$(GREEN)Очистка всего кеша...$(NC)"
	@curl -s -X POST "$(PROXY_URL)/admin/cache/purge" \
		-H "Content-Type: application/json" \
		-H "x-admin-token: $(ADMIN_TOKEN)" \
		-d '{"key": "*"}' | jq .

# Очистка конкретного ключа кеша
.PHONY: cache-purge-key
cache-purge-key:
ifndef KEY
	@echo "$(RED)Ошибка: Укажите KEY=<cache_key>$(NC)"
	@exit 1
endif
	@echo "$(GREEN)Очистка ключа кеша: $(KEY)$(NC)"
	@curl -s -X POST "$(PROXY_URL)/admin/cache/purge" \
		-H "Content-Type: application/json" \
		-H "x-admin-token: $(ADMIN_TOKEN)" \
		-d '{"key": "$(KEY)"}' | jq .

# Тест ограничения скорости
.PHONY: test-rate-limit
test-rate-limit:
	@echo "$(GREEN)Тестирование ограничения скорости (отправка 65 запросов)...$(NC)"
	@for i in $$(seq 1 65); do \
		echo "Запрос $$i:"; \
		curl -s -w "HTTP: %{http_code}, Time: %{time_total}s\n" \
			-X POST "$(PROXY_URL)/v1/chat/completions" \
			-H "Content-Type: application/json" \
			-H "Authorization: Bearer $(API_KEY)" \
			-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Тест $$i"}], "max_tokens": 10}' \
			-o /dev/null; \
		sleep 0.1; \
	done

# Тест кеширования
.PHONY: test-cache
test-cache:
	@echo "$(GREEN)Тестирование кеширования...$(NC)"
	@echo "Первый запрос (должен быть miss):"
	@curl -s -i -X POST "$(PROXY_URL)/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Кеш тест"}], "max_tokens": 50}' | grep -E "(x-cache|HTTP/)"
	@echo ""
	@echo "Второй запрос (должен быть hit):"
	@curl -s -i -X POST "$(PROXY_URL)/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Кеш тест"}], "max_tokens": 50}' | grep -E "(x-cache|HTTP/)"

# Простой нагрузочный тест
.PHONY: load-test
load-test:
	@echo "$(GREEN)Запуск простого нагрузочного теста (10 параллельных запросов)...$(NC)"
	@for i in $$(seq 1 10); do \
		( \
			echo "Запрос $$i начат в $$(date)"; \
			curl -s -w "Запрос $$i: HTTP %{http_code}, время %{time_total}s\n" \
				-X POST "$(PROXY_URL)/v1/chat/completions" \
				-H "Content-Type: application/json" \
				-H "Authorization: Bearer $(API_KEY)-$$i" \
				-d "{\"model\": \"gpt-3.5-turbo\", \"messages\": [{\"role\": \"user\", \"content\": \"Нагрузочный тест $$i\"}], \"max_tokens\": 20}" \
				-o /dev/null \
		) & \
	done; \
	wait; \
	echo "$(GREEN)Нагрузочный тест завершен$(NC)"

# Проверка инвалидации кеша
.PHONY: test-cache-invalidate
test-cache-invalidate:
	@echo "$(GREEN)Тестирование инвалидации кеша...$(NC)"
	@echo "Запрос с принудительным обходом кеша:"
	@curl -s -i -X POST "$(PROXY_URL)/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-H "x-cache-invalidate: true" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Инвалидация кеша"}], "max_tokens": 30}' | grep -E "(x-cache|HTTP/)"

# Получение детальной информации о сервере
.PHONY: server-info
server-info:
	@echo "$(GREEN)Информация о сервере:$(NC)"
	@echo "$(YELLOW)Здоровье:$(NC)"
	@curl -s "$(PROXY_URL)/healthz" | jq .
	@echo ""
	@echo "$(YELLOW)Метрики:$(NC)"
	@curl -s "$(PROXY_URL)/metrics"

# Очистка экрана
.PHONY: clear
clear:
	@clear

# ================== DOCKER КОМАНДЫ ==================

# Сборка Docker образа
.PHONY: docker-build
docker-build:
	@echo "$(GREEN)Сборка Docker образа $(DOCKER_IMAGE_NAME):$(DOCKER_TAG)...$(NC)"
	@docker build -t $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) .
	@echo "$(GREEN)Образ собран успешно!$(NC)"

# Запуск контейнера
.PHONY: docker-run
docker-run:
	@echo "$(GREEN)Запуск Docker контейнера...$(NC)"
	@docker run -d \
		--name $(CONTAINER_NAME) \
		-p 8080:8080 \
		--env-file .env \
		$(DOCKER_IMAGE_NAME):$(DOCKER_TAG)
	@echo "$(GREEN)Контейнер запущен! Проверяем здоровье...$(NC)"
	@sleep 5
	@docker exec $(CONTAINER_NAME) node -e "const http = require('http'); const options = { hostname: 'localhost', port: 8080, path: '/healthz', timeout: 3000 }; const req = http.request(options, (res) => { console.log('Health check:', res.statusCode === 200 ? 'OK' : 'FAIL'); }); req.on('error', (e) => console.log('Health check FAIL:', e.message)); req.end();" || true

# Остановка и удаление контейнера
.PHONY: docker-stop
docker-stop:
	@echo "$(GREEN)Остановка Docker контейнера...$(NC)"
	@docker stop $(CONTAINER_NAME) 2>/dev/null || true
	@docker rm $(CONTAINER_NAME) 2>/dev/null || true
	@echo "$(GREEN)Контейнер остановлен$(NC)"

# Просмотр логов контейнера
.PHONY: docker-logs
docker-logs:
	@echo "$(GREEN)Логи контейнера $(CONTAINER_NAME):$(NC)"
	@docker logs -f $(CONTAINER_NAME)

# Вход в контейнер
.PHONY: docker-shell
docker-shell:
	@echo "$(GREEN)Вход в контейнер $(CONTAINER_NAME)...$(NC)"
	@docker exec -it $(CONTAINER_NAME) sh

# Очистка: удаление контейнера и образа
.PHONY: docker-clean
docker-clean: docker-stop
	@echo "$(GREEN)Удаление Docker образа...$(NC)"
	@docker rmi $(DOCKER_IMAGE_NAME):$(DOCKER_TAG) 2>/dev/null || true
	@echo "$(GREEN)Очистка завершена$(NC)"

# Docker Compose - запуск
.PHONY: docker-compose-up
docker-compose-up:
	@echo "$(GREEN)Запуск через docker-compose...$(NC)"
	@docker compose up -d
	@echo "$(GREEN)Сервисы запущены! Ждем готовности...$(NC)"
	@sleep 10
	@docker compose ps

# Docker Compose - остановка
.PHONY: docker-compose-down
docker-compose-down:
	@echo "$(GREEN)Остановка docker-compose...$(NC)"
	@docker compose down
	@echo "$(GREEN)Сервисы остановлены$(NC)"

# Docker Compose - запуск с тестовым профилем
.PHONY: docker-compose-test
docker-compose-test:
	@echo "$(GREEN)Запуск с тестовым профилем...$(NC)"
	@docker compose --profile test up --build --abort-on-container-exit
	@docker compose down

# Полный Docker тест: сборка + запуск + тестирование + очистка
.PHONY: docker-test
docker-test: docker-clean docker-build
	@echo "$(GREEN)Полный Docker тест...$(NC)"
	@$(MAKE) docker-run
	@echo "$(GREEN)Ждем запуска сервиса (10 сек)...$(NC)"
	@sleep 10
	@echo "$(GREEN)Запуск тестов...$(NC)"
	@echo "$(YELLOW)Тест health:$(NC)"
	@curl -f http://localhost:8080/healthz || (echo "$(RED)Health test failed$(NC)" && exit 1)
	@echo "$(YELLOW)Тест metrics:$(NC)"
	@curl -f http://localhost:8080/metrics > /dev/null || (echo "$(RED)Metrics test failed$(NC)" && exit 1)
	@echo "$(YELLOW)Тест chat API:$(NC)"
	@curl -s -X POST "http://localhost:8080/v1/chat/completions" \
		-H "Content-Type: application/json" \
		-H "Authorization: Bearer $(API_KEY)" \
		-d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Docker test"}], "max_tokens": 10}' \
		| grep -q "error\|choices" || (echo "$(RED)Chat API test failed$(NC)" && exit 1)
	@echo "$(GREEN)Все тесты прошли успешно!$(NC)"
	@$(MAKE) docker-stop
	@echo "$(GREEN)Docker тест завершен$(NC)"

# Быстрый запуск: сборка и запуск с тестом chat
.PHONY: docker-quick-start
docker-quick-start: docker-build docker-run
	@echo "$(GREEN)Быстрый старт завершен! Тестируем chat...$(NC)"
	@sleep 8
	@$(MAKE) chat
	@echo "$(GREEN)Готово! Контейнер работает на http://localhost:8080$(NC)"

# Выполнение команд внутри контейнера
.PHONY: docker-exec-chat
docker-exec-chat:
	@echo "$(GREEN)Выполнение chat запроса внутри контейнера...$(NC)"
	@docker exec --user root $(CONTAINER_NAME) sh -c "apk add --no-cache curl jq > /dev/null 2>&1 || true"
	@docker exec $(CONTAINER_NAME) sh -c "curl -s -X POST 'http://127.0.0.1:8080/v1/chat/completions' \
		-H 'Content-Type: application/json' \
		-H 'Authorization: Bearer $(API_KEY)' \
		-d '{\"model\": \"gpt-3.5-turbo\", \"messages\": [{\"role\": \"user\", \"content\": \"hi!how are you?\"}], \"max_tokens\": 100, \"temperature\": 0.7}' \
		| jq . 2>/dev/null || cat"

# Выполнение health check внутри контейнера
.PHONY: docker-exec-health
docker-exec-health:
	@echo "$(GREEN)Проверка здоровья изнутри контейнера...$(NC)"
	@docker exec --user root $(CONTAINER_NAME) sh -c "apk add --no-cache curl jq > /dev/null 2>&1 || true"
	@docker exec $(CONTAINER_NAME) sh -c "curl -s http://127.0.0.1:8080/healthz | jq . 2>/dev/null || curl -s http://127.0.0.1:8080/healthz"

# Выполнение метрик внутри контейнера
.PHONY: docker-exec-metrics
docker-exec-metrics:
	@echo "$(GREEN)Получение метрик изнутри контейнера...$(NC)"
	@docker exec --user root $(CONTAINER_NAME) sh -c "apk add --no-cache curl > /dev/null 2>&1 || true"
	@docker exec $(CONTAINER_NAME) sh -c "curl -s http://127.0.0.1:8080/metrics"

# Выполнение всех тестов внутри контейнера
.PHONY: docker-exec-test-all
docker-exec-test-all:
	@echo "$(GREEN)Запуск всех тестов изнутри контейнера...$(NC)"
	@echo "$(YELLOW)1. Health check:$(NC)"
	@$(MAKE) docker-exec-health
	@echo ""
	@echo "$(YELLOW)2. Metrics:$(NC)"
	@$(MAKE) docker-exec-metrics
	@echo ""
	@echo "$(YELLOW)3. Chat API:$(NC)"
	@$(MAKE) docker-exec-chat
	@echo "$(GREEN)Все тесты завершены!$(NC)"

# Интерактивная оболочка с установленными инструментами
.PHONY: docker-exec-shell-tools
docker-exec-shell-tools:
	@echo "$(GREEN)Установка инструментов и вход в контейнер...$(NC)"
	@docker exec $(CONTAINER_NAME) sh -c "apk add --no-cache curl jq wget > /dev/null 2>&1 || true"
	@echo "$(GREEN)Инструменты установлены. Входим в контейнер...$(NC)"
	@docker exec -it $(CONTAINER_NAME) sh

# По умолчанию показывать справку
.DEFAULT_GOAL := help
