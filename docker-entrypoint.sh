#!/bin/sh

echo "Ожидание запуска Gotenberg..."

# Ждем доступности Gotenberg
until curl -s -f -o /dev/null "http://gotenberg:3000/health"; do
  echo "Gotenberg не доступен, ждем..."
  sleep 2
done

echo "Gotenberg доступен, запускаем watcher..."

# Запускаем watcher
exec node pptx-watcher.js "${INPUT_DIR}" "${OUTPUT_DIR}" "${GOTENBERG_URL}"
