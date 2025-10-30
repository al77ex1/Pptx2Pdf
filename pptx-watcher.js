#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const FormData = require('form-data');
const axios = require('axios');

class PPTXWatcher {
  constructor(inputDir, outputDir, gotenbergUrl = 'http://localhost:3000', cleanupDays = 7) {
    this.inputDir = path.resolve(inputDir);
    this.outputDir = path.resolve(outputDir);
    this.gotenbergUrl = gotenbergUrl;
    this.cleanupDays = cleanupDays;
    this.processing = new Set();
    this.cleanupInterval = null;
  }

  async checkGotenberg() {
    try {
      const response = await axios.get(`${this.gotenbergUrl}/health`, { timeout: 5000 });
      console.log(`✓ Gotenberg доступен: ${this.gotenbergUrl}`);
      return true;
    } catch (error) {
      console.error(`✗ Ошибка: не удается подключиться к Gotenberg (${this.gotenbergUrl})`);
      console.error(`  ${error.message}`);
      console.error('\nУбедитесь, что Docker контейнер с Gotenberg запущен:');
      console.error('  docker-compose up -d');
      return false;
    }
  }

  isPdfExists(pptxPath) {
    const baseName = path.basename(pptxPath, path.extname(pptxPath));
    const pdfPath = path.join(this.outputDir, `${baseName}.pdf`);
    return fs.existsSync(pdfPath);
  }

  isPdfNewer(pptxPath) {
    const baseName = path.basename(pptxPath, path.extname(pptxPath));
    const pdfPath = path.join(this.outputDir, `${baseName}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      return false;
    }

    try {
      const pptxStats = fs.statSync(pptxPath);
      const pdfStats = fs.statSync(pdfPath);
      return pdfStats.mtime > pptxStats.mtime;
    } catch (error) {
      return false;
    }
  }

  cleanupOldFiles() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Проверка старых файлов (старше ${this.cleanupDays} дней)...`);

    const now = Date.now();
    const maxAge = this.cleanupDays * 24 * 60 * 60 * 1000; // дни в миллисекунды
    let deletedCount = 0;

    // Очистка PPTX файлов
    try {
      const pptxFiles = fs.readdirSync(this.inputDir);

      for (const file of pptxFiles) {
        const ext = path.extname(file).toLowerCase();
        if (!['.pptx', '.ppt'].includes(ext)) {
          continue;
        }

        const filePath = path.join(this.inputDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          const baseName = path.basename(file, ext);
          const pdfPath = path.join(this.outputDir, `${baseName}.pdf`);

          // Удаляем PPTX
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑 Удален старый PPTX: ${file}`);
            deletedCount++;
          } catch (error) {
            console.error(`✗ Ошибка удаления ${file}: ${error.message}`);
          }

          // Удаляем соответствующий PDF если существует
          if (fs.existsSync(pdfPath)) {
            try {
              fs.unlinkSync(pdfPath);
              console.log(`🗑 Удален соответствующий PDF: ${baseName}.pdf`);
              deletedCount++;
            } catch (error) {
              console.error(`✗ Ошибка удаления ${baseName}.pdf: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`✗ Ошибка при сканировании папки PPTX: ${error.message}`);
    }

    // Очистка PDF файлов
    try {
      const pdfFiles = fs.readdirSync(this.outputDir);
      const pptxFiles = fs.readdirSync(this.inputDir);

      // Создаем Set имен PPTX файлов (без расширения) для быстрой проверки
      const pptxBaseNames = new Set(
        pptxFiles
          .filter(file => ['.pptx', '.ppt'].includes(path.extname(file).toLowerCase()))
          .map(file => path.basename(file, path.extname(file)))
      );

      for (const file of pdfFiles) {
        if (path.extname(file).toLowerCase() !== '.pdf') {
          continue;
        }

        const filePath = path.join(this.outputDir, file);
        const baseName = path.basename(file, '.pdf');
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();

        // Удаляем если нет соответствующего PPTX (осиротевший PDF)
        if (!pptxBaseNames.has(baseName)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑 Удален осиротевший PDF (нет соответствующего PPTX): ${file}`);
            deletedCount++;
          } catch (error) {
            console.error(`✗ Ошибка удаления ${file}: ${error.message}`);
          }
          continue;
        }

        // Удаляем если старше срока хранения
        if (age > maxAge) {
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑 Удален старый PDF: ${file}`);
            deletedCount++;
          } catch (error) {
            console.error(`✗ Ошибка удаления ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`✗ Ошибка при сканировании папки PDF: ${error.message}`);
    }

    if (deletedCount === 0) {
      console.log(`✓ Старых и осиротевших файлов не найдено`);
    } else {
      console.log(`✓ Удалено файлов: ${deletedCount}`);
    }
    console.log(`${'='.repeat(60)}`);
  }


  startCleanupScheduler() {
    // Запускаем очистку сразу при старте
    this.cleanupOldFiles();

    // Запускаем периодическую очистку каждые 24 часа
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldFiles();
    }, 24 * 60 * 60 * 1000);

    console.log(`✓ Планировщик очистки запущен (проверка каждые 24 часа)\n`);
  }

  async convertFile(pptxPath) {
    const fileName = path.basename(pptxPath);
    const baseName = path.basename(pptxPath, path.extname(pptxPath));
    const outputPath = path.join(this.outputDir, `${baseName}.pdf`);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Обнаружен файл: ${fileName}`);

    // Проверка существования PDF
    if (this.isPdfExists(pptxPath)) {
      if (this.isPdfNewer(pptxPath)) {
        console.log(`⊘ PDF уже существует и актуален, пропускаем: ${baseName}.pdf`);
        return;
      } else {
        console.log(`⟳ PDF существует, но PPTX новее, обновляем...`);
      }
    }

    console.log(`Конвертация в PDF через Gotenberg...`);

    try {
      const form = new FormData();
      form.append('files', fs.createReadStream(pptxPath), {
        filename: fileName,
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });

      const response = await axios.post(
        `${this.gotenbergUrl}/forms/libreoffice/convert`,
        form,
        {
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      if (response.status === 200) {
        fs.writeFileSync(outputPath, response.data);
        const sizeKB = (response.data.length / 1024).toFixed(2);
        console.log(`✓ Успешно сконвертировано: ${path.basename(outputPath)}`);
        console.log(`  Размер: ${sizeKB} KB`);
      } else {
        console.error(`✗ Ошибка конвертации: HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(`✗ Ошибка при конвертации: ${error.message}`);
      if (error.response) {
        console.error(`  HTTP ${error.response.status}: ${error.response.statusText}`);
      }
    }
  }

  async handleNewFile(filePath) {
    // Проверяем расширение
    const ext = path.extname(filePath).toLowerCase();
    if (!['.pptx', '.ppt'].includes(ext)) {
      return;
    }

    // Предотвращаем двойную обработку
    if (this.processing.has(filePath)) {
      return;
    }

    this.processing.add(filePath);

    try {
      // Небольшая задержка для завершения копирования файла
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Проверяем, что файл все еще существует
      if (fs.existsSync(filePath)) {
        await this.convertFile(filePath);
      }
    } catch (error) {
      console.error(`Ошибка при обработке ${path.basename(filePath)}: ${error.message}`);
    } finally {
      this.processing.delete(filePath);
    }
  }

  async start() {
    // Проверяем директории
    if (!fs.existsSync(this.inputDir)) {
      console.error(`Ошибка: папка '${this.inputDir}' не существует!`);
      process.exit(1);
    }

    // Создаем выходную директорию если её нет
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Проверяем доступность Gotenberg
    const isAvailable = await this.checkGotenberg();
    if (!isAvailable) {
      process.exit(1);
    }

    // Настраиваем наблюдатель
    console.log(`\n${'='.repeat(60)}`);
    console.log('Мониторинг запущен');
    console.log(`Входная папка:  ${this.inputDir}`);
    console.log(`Выходная папка: ${this.outputDir}`);
    console.log(`Gotenberg URL:  ${this.gotenbergUrl}`);
    console.log(`Срок хранения:  ${this.cleanupDays} дней`);
    console.log(`\nОжидание новых PPTX файлов... (Ctrl+C для остановки)`);
    console.log(`${'='.repeat(60)}`);

    // Запускаем планировщик очистки
    this.startCleanupScheduler();

    const watcher = chokidar.watch(this.inputDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    watcher.on('add', (filePath) => {
      this.handleNewFile(filePath);
    });

    watcher.on('change', (filePath) => {
      // Реагируем на изменение файла
      this.handleNewFile(filePath);
    });

    watcher.on('error', (error) => {
      console.error(`Ошибка наблюдателя: ${error.message}`);
    });

    // Обработка завершения
    process.on('SIGINT', () => {
      console.log('\n\nОстановка мониторинга...');
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
      watcher.close();
      process.exit(0);
    });
  }
}

// CLI или переменные окружения
if (require.main === module) {
  const args = process.argv.slice(2);

  let inputDir, outputDir, gotenbergUrl, cleanupDays;

  // Приоритет: аргументы CLI > переменные окружения > значения по умолчанию
  if (args.length >= 2) {
    inputDir = args[0];
    outputDir = args[1];
    gotenbergUrl = args[2] || process.env.GOTENBERG_URL || 'http://localhost:3000';
    cleanupDays = parseInt(args[3] || process.env.CLEANUP_DAYS || '7');
  } else if (process.env.INPUT_DIR && process.env.OUTPUT_DIR) {
    inputDir = process.env.INPUT_DIR;
    outputDir = process.env.OUTPUT_DIR;
    gotenbergUrl = process.env.GOTENBERG_URL || 'http://localhost:3000';
    cleanupDays = parseInt(process.env.CLEANUP_DAYS || '7');
  } else {
    console.log(`
Использование: node pptx-watcher.js <input_dir> <output_dir> [gotenberg_url] [cleanup_days]

Аргументы:
input_dir      Папка для мониторинга (где появляются PPTX файлы)
output_dir     Папка для сохранения PDF файлов
gotenberg_url  URL Gotenberg сервера (по умолчанию: http://localhost:3000)
cleanup_days   Срок хранения файлов в днях (по умолчанию: 7)

Переменные окружения:
INPUT_DIR      Входная папка
OUTPUT_DIR     Выходная папка
GOTENBERG_URL  URL Gotenberg сервера
CLEANUP_DAYS   Срок хранения файлов в днях

Примеры:
node pptx-watcher.js ./pptx ./pdf
node pptx-watcher.js ./pptx ./pdf http://localhost:3000 14
`);
    process.exit(0);
  }

  const watcher = new PPTXWatcher(inputDir, outputDir, gotenbergUrl, cleanupDays);
  watcher.start();
}

module.exports = PPTXWatcher;
