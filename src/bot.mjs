import fs from 'fs'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import webshot from 'webshot'
import sizeOf from 'image-size'
import highlight from 'highlight.js'
import TelegramBot from 'node-telegram-bot-api'

const md5 = crypto.createHash('md5')
const token = 'YOUR_BOT_TOKEN'
const server = 'DOMAIN_OR_IP' // Server domain or IP
const serverURL = 'http://' + server + '/SyntaxHighlightBot/images/'

const getPath = (file) => path.join(__dirname, `images/${file}`)

const getFileURL = (file) => serverURL + file

const getImageWidth = (file) => sizeOf(getPath(file)).width

const getImageHeight = (file) => sizeOf(getPath(file)).height

const isExisted = (file) => fs.existsSync(file)

const getPhotoData = (file, idx = null) => ({
  'type': 'photo',
  'photo_url': getFileURL(file),
  'thumb_url': getFileURL(file),
  'photo_width': getImageWidth(file),
  'photo_height': getImageHeight(file),
  'id': file + (idx || ''),
})

http.createServer(function (request, response) {
  console.log(JSON.stringify(request.headers))

  if (request.method.toLowerCase() !== 'post') {
    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.write('ERROR Petición no válida\n')
    response.end()
    return
  }

  let body = ''

  request.on('data', function (data) {
    body += data
    // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
    if (body.length > 1e6) {
      // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
      request.connection.destroy()
    }
  })

  request.on('end', function () {
    request.headers.recent = request.headers.recent || ''
    const bot = new TelegramBot(token)

    if (!body && request.headers.inline) {
      console.log('INLINE VACIO')
      bot.answerInlineQuery(
        request.headers.inline,
        request.headers.recent.split(',').filter(isExisted).map(getPhotoData),
        { 'is_personal': true, 'cache_time': 0 }
      )
      return
    }

    const fileName = `${md5(body)}_${request.headers.theme}.jpg`

    const htmlhighlight = !request.headers.lang
      ? highlight.highlightAuto(body)
      : highlight.highlight(request.headers.lang, body)

    let sendPhotoOptions

    if (!request.headers.inline) {
      sendPhotoOptions = { 'reply_to_message_id': request.headers.messageid }
      if (request.headers.demo == 1) {
        sendPhotoOptions['reply_markup'] = {
          'inline_keyboard': [[{
            'text': 'Apply theme',
            'callback_data': request.headers.theme,
          }]],
        }
      }
    }

    if (fs.existsSync(getPath(fileName))) {
      if (request.headers.inline) {
        bot.answerInlineQuery(
          request.headers.inline,
          [getPhotoData(getPath(fileName))]
            .concat(
              request.headers.recent.split(',')
                .filter(isExisted)
                .map(getPhotoData)
            ),
          { 'is_personal': true, 'cache_time': 0 }
        )
        return
      }

      bot.sendChatAction(request.headers.chatid, 'upload_photo')
      bot.sendPhoto(request.headers.chatid, getPath(fileName), sendPhotoOptions)

      response.writeHead(200, { 'Content-Type': 'text/plain' })
      response.write(fileName)
      console.log(fileName)
      response.end()
      return
    }

    if (!(htmlhighlight.relevance > 7 || request.headers.lang)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' })
      response.write('ERROR Sin relevancia\n')
      response.end()

      const uploadsDir = __dirname + '/images'

      fs.readdir(uploadsDir, function (err, files) {
        files.forEach(function (file) {
          fs.stat(path.join(uploadsDir, file), function (err, stat) {
            let endTime, now
            if (err) {
              return console.error(err)
            }
            now = new Date().getTime()
            endTime = new Date(stat.ctime).getTime() + 3600000
            if (now > endTime) {
              return rimraf(path.join(uploadsDir, file), function (err) {
                if (err) {
                  return console.error(err)
                }
                console.log('successfully deleted')
              })
            }
          })
        })
      })
      return
    }

    fs.readFile(
      path.join(__dirname, `node_modules/highlight.js/styles/${request.headers.theme}.css`),
      'utf8',
      (err, data) => {
        if (err) {
          response.writeHead(404, { 'Content-Type': 'text/plain' })
          response.write('ERROR al leer estilo\n')
          response.end()
        }

        const html = `
<html lang="en">
<head>
<style>
::-webkit-scrollbar {
  display: none;
}
${data}
</style>
</head>
<body style="display: inline-block;">
<pre style="max-width:1400px">
<code class="hljs" id="code"
  style="white-space:pre-wrap;font-size:12pt;font-family:'Inconsolata'"
>${htmlhighlight.value}</code>
</pre>
</body>
</html>
`
        webshot(
          html,
          getPath(fileName),
          {
            siteType: 'html',
            captureSelector: '#code',
            quality: 100,
            shotSize: { width: 'all', height: 'all' },
          },
          (err) => {
            if (err) {
              response.writeHead(404, { 'Content-Type': 'text/plain' })
              response.write('ERROR al generar imagen\n')
              response.end()
              return
            }

            if (request.headers.inline) {
              bot.answerInlineQuery(
                request.headers.inline,
                [getPhotoData(getPath(fileName))]
                  .concat(
                    request.headers.recent.split(',')
                      .filter(isExisted)
                      .map(getPhotoData)
                  ),
                { 'is_personal': true, 'cache_time': 0 }
              )
              return
            }

            bot.sendChatAction(request.headers.chatid, 'upload_photo')
            bot.sendPhoto(request.headers.chatid, getPath(fileName), sendPhotoOptions)

            response.writeHead(200, { 'Content-Type': 'text/plain' })
            response.write(fileName)
            console.log(fileName)
            response.end()

            return
          }
        )
      }
    )
  })
}).listen(parseInt(8888, 10))

console.log('HightlightNode server running at\n  => http://localhost:8888/\nCtrl + C to shutdown')