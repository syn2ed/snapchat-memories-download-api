const express = require('express')
var zip = require('express-zip')
var cors = require('cors')
const fileUpload = require('express-fileupload')
var AdmZip = require("adm-zip")
const fs = require('fs')
const { https } = require('follow-redirects')

const app = express()
const port = 3000

var corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
app.use(cors(corsOptions))

const dateNow = Date.now()
const extractZipsPath = `${__dirname}/extracted_zips/${dateNow}`
const extractMediasPath = `${__dirname}/downloaded_medias/${dateNow}`

app.use(
    fileUpload({
        createParentPath: true,
    }),
)

app.get('/ping', (req, res) => {
    res.send('pong')
})

app.post('/upload-snapchat-file', async (req, res) => {
    if (!req.files || !req.files.snapchatZip) {
        res.status(400).send("No file uploaded")
        return
    }

    try {
        console.log('start downloading medias of zip size: ' + req.files.snapchatZip.size)

        await extractZip(req.files.snapchatZip)
        let mediasLinks = await getMediasLinksByZipPath(extractZipsPath)
        let mediasPaths = await downloadMediasByMediasLinks(mediasLinks)

        //return API response
        await res.zip(mediasPaths.map((mediaPath) => {
            return {
                path: mediaPath,
                name: mediaPath.split('/')[2]
            }
        }))
        
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
        await delay(600000)

        /* delete downladed_medias folder */
        console.log('deleting folder: ', extractMediasPath)
        fs.rm(extractMediasPath, { recursive: true, force: true }, (err) => {
            if (err) {
                return console.error('folder deletion error: ', err)
            }
        })

        /* delete extracted_zips folder */
        console.log('deleting folder: ', extractZipsPath)
        fs.rm(extractZipsPath, { recursive: true, force: true }, (err) => {
            if (err) {
                return console.error('folder deletion error: ', err)
            }
        })
        
        console.log('/upload-snapchat-file endpoint process successful')
    } catch (err) {
        console.error('/upload-snapchat-file endpoint error: ', err)
        res.status(500).send(err)
    }
})

app.listen(process.env.PORT || 3000, () => {
    console.log(`Example app listening at http://localhost:3000`)
})

function extractZip(zipFile) {
    return new Promise(async (resolve, reject) => {
        let zip = new AdmZip(zipFile.data)
        await zip.extractAllTo(extractZipsPath, true, true, '')
        resolve()
    })
}

function getMediasLinksByZipPath(zipPath) {
    if (!fs.existsSync(zipPath + '/json/memories_history.json')) {
        console.log('in if (!fs.existsSync(zipPath + /json/memories_history.json')
        throw new Error('memories_history.json not exists')
    }

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
    const mediaPath = `downloaded_medias/${dateNow}/${fileName}`

    //console.debug('mediaFormat: ', mediaFormat)

    return new Promise(async (resolve, reject) => {
        // Folder creation for saving medias in. Ex: "downloaded_medias/9379737426"
        if (!fs.existsSync(extractMediasPath)) {
            fs.mkdir(extractMediasPath, (err) => {
                if (err) {
                    return console.error('folder creation error in downloadMediaByUrl: ', err)
                }
            })
        }
        
        const file = await fs.createWriteStream(mediaPath)

        https.get(url, function(response) {
            if (response.statusCode != 200) {
                console.error('snapchat download url response statusCode != 200: ', response.statusCode)
            }
        
            response.pipe(file)

            file.on("finish", () => {
                    file.close()
                    //console.debug('file stats.size: ', fs.statSync(file.path).size)
                    resolve(mediaPath)
                })
        }).on('error', (e) => {
            console.error('downloadMediaByUrl error: ', e)
          })
    })
}

async function downloadMediasByMediasLinks(mediasLinks) {
    let mediasPaths = []

    for(let i = 0; i < mediasLinks.length; i++) {
        const downloadUrl = await getDownloadUrlFromMemoryJsonUrl(mediasLinks[i])
        mediasPaths.push(downloadMediaByUrl(downloadUrl))
    }

    return Promise.all(mediasPaths)
}