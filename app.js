const express = require('express')
const fileUpload = require('express-fileupload')
var AdmZip = require("adm-zip")
const fs = require('fs')
const { https } = require('follow-redirects')

const app = express()
const port = 3000
const extractZipsPath = `${__dirname}/extracted_zips/${Date.now()}`

app.use(
    fileUpload({
        createParentPath: true,
    }),
)

app.get('/ping', (req, res) => {
    console.log('dirname: ', __dirname)
    res.send('pong')
})

app.post('/upload-snapchat-file', async (req, res) => {
    if (!req.files) {
        res.send({
            status: false,
            message: 'No file uploaded',
        })
        return
    }

    try {
        let snapchatZipObject = req.files.snapchatZip

        var zip = new AdmZip(snapchatZipObject.data)
        zip.extractAllTo(extractZipsPath, true, true, '')

        let memoriesHistoryJson = fs.readFileSync(extractZipsPath + '/json/memories_history.json')
        let mediasLinks = JSON.parse(memoriesHistoryJson)["Saved Media"].map((mediaObject) => mediaObject["Download Link"])

        const downloadUrl = await getDownloadUrlFromMemoryJsonUrl(mediasLinks[0])

        await downloadMediaByUrl(downloadUrl)

        //send response
        res.send("ok")
    } catch (err) {
        res.status(500).send(err)
    }
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Example app listening at http://localhost:3000`)
})


function getDownloadUrlFromMemoryJsonUrl(url) {
    return new Promise(async (resolve, reject) => {
        const urlObject = new URL(url)
        var str = ''

        const request = https.request({
            host: urlObject.host,
            path: urlObject.pathname + urlObject.search,
            method: 'POST'
        }, (response) => {
            response.on('data', function (chunk) {
                str += chunk
              })

            response.on('end', function () {
            resolve(str)
            })
        })
        .on('error', err => {
            reject(err)
        })

        request.end()
    })
}

function downloadMediaByUrl(url) {
    const mediaFormat = (new URL(url)).pathname.split('.')[1]
    console.log('mediaFormat: ', mediaFormat)

    return new Promise(async (resolve, reject) => {
        console.log('in downloadMediaByUrl promise')
        const file = fs.createWriteStream(`downloaded_medias/file-${Date.now()}.${mediaFormat}`)

        https.get(url, function(response) {
            console.log('response statusCode: ', response.statusCode)
            response.pipe(file)

            file.on("finish", () => {
                    file.close()
                    console.log('file stats: ', fs.statSync(file.path))
                    console.log("Download Completed")
                    resolve()
                })
        }).on('error', (e) => {
            console.error('downloadMediaByUrl error: ', e)
          })
    })
}