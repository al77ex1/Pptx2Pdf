### Установка и запуск
```bash
$ docker compose up -d --build
```

### Остановка
```bash
$ docker compose down
```


### Использование

Выкладываем файл презентации в формате pptx в папку pptx
И через время появляется аналогичный файл в формате pdf в папке pdf

### Далее отладочная информация:

### Конвертация из консоли
```bash
$ curl --request POST   --url http://localhost:3000/forms/libreoffice/convert   --form 'files=@"./presentation.pptx"'   --output result.pdf
```

### Базовое использование в консоли
```bash
node pptx-watcher.js ./pptx ./pdf
```

### С указанием URL Gotenberg
```bash
node pptx-watcher.js ./pptx ./pdf http://localhost:3000
```

### Показать справку
```bash
node pptx-watcher.js --help
```
