# Установка и запуск

$ docker compose up -d --build

# Остановка

$ docker compose down


# Использование

Выкладываем файл презентации в формате pptx в папку pptx
И через время появляется аналогичный файл в формате pdf в папке pdf


# Далее отладочная информация:

# Конвертация из консоли

$ curl --request POST   --url http://localhost:3000/forms/libreoffice/convert   --form 'files=@"./presentation.pptx"'   --output result.pdf

# Базовое использование в консоли
node pptx-watcher.js ./pptx ./pdf

# С указанием URL Gotenberg
node pptx-watcher.js ./pptx ./pdf http://localhost:3000

# Показать справку
node pptx-watcher.js --help
