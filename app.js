const express = require('express')
const fileUpload = require('express-fileupload')
var AdmZip = require("adm-zip")
const fs = require('fs')
const { https } = require('follow-redirects')

const app = express()
const port = 3000

const dateNow = Date.now()
const extractZipsPath = `${__dirname}/extracted_zips/${dateNow}`
const extractMediasPath = `${__dirname}/extracted_zips/${dateNow}`

app.use(
    fileUpload({
        createParentPath: true,
    }),
)

app.get('/ping', (req, res) => {
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
        await extractZip(req.files.snapchatZip)
        let mediasLinks = await getMediasLinksByZipPath(extractZipsPath)
        await downloadMediasByMediasLinks(mediasLinks)
        
        
        //return API response
        res.send("ok")
    } catch (err) {
        res.status(500).send(err)
    }
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Example app listening at http://localhost:3000`)
})

function extractZip(zipFile) {
    return new Promise(async (resolve, reject) => {
        var zip = new AdmZip(zipFile.data)
        await zip.extractAllTo(extractZipsPath, true, true, '')
        resolve()
    })
}

function getMediasLinksByZipPath(zipPath) {
    let memoriesHistoryJson = fs.readFileSync(zipPath + '/json/memories_history.json')
    return JSON.parse(memoriesHistoryJson)["Saved Media"].map((mediaObject) => mediaObject["Download Link"])
}

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
    const fileName = new URL(url).pathname.split('/')[3]
    const mediaPath = `downloaded_medias/${dateNow}/${fileName}.${mediaFormat}`

    console.debug('mediaFormat: ', mediaFormat)

    return new Promise(async (resolve, reject) => {
        // Folder creation for saving medias in. Ex: "downloaded_medias/9379737426"
        if (!fs.existsSync(`downloaded_medias/${dateNow}`)) {
            fs.mkdir(`downloaded_medias/${dateNow}`, (err) => {
                if (err) {
                    return console.error('folder creation error in downloadMediaByUrl: ', err)
                }
            })
        }
        
        const file = await fs.createWriteStream(mediaPath)

        https.get(url, function(response) {
            console.log('snapchat download url response statusCode: ', response.statusCode)
            response.pipe(file)

            file.on("finish", () => {
                    file.close()
                    console.log('file stats.size: ', fs.statSync(file.path).size)
                    resolve()
                })
        }).on('error', (e) => {
            console.error('downloadMediaByUrl error: ', e)
          })
    })
}

async function downloadMediasByMediasLinks(mediasLinks) {
    for(let i = 0; i < mediasLinks.length; i++) {
        const downloadUrl = await getDownloadUrlFromMemoryJsonUrl(mediasLinks[i])
        downloadMediaByUrl(downloadUrl)
    }
}