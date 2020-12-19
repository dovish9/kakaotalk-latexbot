const fs = require('fs');
const shell = require('shelljs');
const express = require('express');

//date-utils
require('date-utils');
var date = new Date();

const local = ''; //local's external IP
const port = 3001;

const staticDir = 'static/';
const tempDirRoot = 'temp/';
const outputDir = 'output/';
const httpOutputURL = 'output/';
const screenshotsDir = 'screenshots/';

// Checklist of valid formats and scales, to verify form values are correct
const validFormats = ['SVG', 'PNG', 'JPG'];
const validScales = ['10%', '25%', '50%', '75%', '100%', '125%', '150%', '200%', '500%', '1000%'];
// Percentage scales mapped to floating point values used in arguments
const validScalesInternal = ['0.1', '0.25', '0.5', '0.75', '1.0', '1.25', '1.5', '2.0', '5.0', '10.0'];

// Command to compile .tex file to .dvi file. Timeout kills LaTeX after 5 seconds if held up
const latexCMD = 'timeout 5 latex -interaction nonstopmode -halt-on-error --no-shell-escape equation.tex';

// Command to convert .dvi to .svg file
const dvisvgmCMD = 'dvisvgm --no-fonts --scale=OUTPUT_SCALE --exact equation.dvi';

const dockerImageName = 'blang/latex:ubuntu'; // https://github.com/blang/latex-docker

// Command to run the above commands in a new Docker container (with LaTeX preinstalled)
const dockerCMD = `cd TEMP_DIR_NAME && exec docker run --rm -i --user="$(id -u):$(id -g)" --net=none -v "$PWD":/data "${dockerImageName}" /bin/sh -c "${latexCMD} && ${dvisvgmCMD}"`;

// Commands to convert .svg to .png/.jpg and compress
const svgToImageCMD = 'svgexport SVG_FILE_NAME OUT_FILE_NAME';
const imageMinCMD = 'imagemin IN_FILE_NAME > OUT_FILE_NAME';

const fontSize = 12;

// LaTeX document template
const preamble = `
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsfonts}
\\usepackage[utf8]{inputenc}
`;

const documentTemplate = `
\\documentclass[${fontSize}pt]{article}
${preamble}
\\thispagestyle{empty}
\\begin{document}
\\begin{align*}
EQUATION
\\end{align*}
\\end{document}`;

// Create temp and output directories on first run
if(!fs.existsSync(tempDirRoot)){
    fs.mkdirSync(tempDirRoot);
}
if(!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

const app = express();

const bodyParser = require('body-parser');
const { EROFS } = require('constants');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Allow static html files and output files to be accessible
app.use('/', express.static(staticDir));
app.use('/output', express.static(outputDir));
app.use('/screenshots', express.static(screenshotsDir));

// POST call for LaTeX to image conversion. Convert and return image URL or error message
app.post('/convert', function(req, res){
    // Text message for invalid inputs
    let textMessage = JSON.stringify({
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": "TEXT_MESSAGE"
              }
            }
          ]
        }
      });
    // Image message format
    let imageMessage = JSON.stringify({
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleImage": {
                "imageUrl": "IMAGE_URL",
                "altText": "url이 유효하지 않습니다."
              }
            }
          ]
        }
      });
    // Card message with a text button
    let buttonCardMessage = JSON.stringify({
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "basicCard": {
                "title": "TITLE",
                "description": "DESCRIPTION",
                "thumbnail": {
                  "imageUrl": "THUMBNAIL_URL"
                },
                "buttons": [
                  {
                    "action": "message",
                    "label": "BUTTON_NAME",
                    "messageText": "MESSAGE_TEXT"
                  }
                ]
              }
            }
          ]
        }
      });
    // Card Message with a url button
    let urlCardMessage = JSON.stringify({
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "basicCard": {
                "title": "TITLE",
                "description": "DESCRIPTION",
                "thumbnail": {
                  "imageUrl": "THUMBNAIL_URL"
                },
                "buttons": [
                  {
                    "action":  "webLink",
                    "label": "BUTTON_NAME",
                    "webLinkUrl": "WEB_URL"
                  }
                ]
              }
            }
          ]
        }
      });
    let uq = req.body.userRequest
    if(uq.utterance.slice(-1)=='\n'){
        requestedString = uq.utterance.slice(0, -1);
    }
    else{
        requestedString = uq.utterance;
    }
    let commonLog = 'timezone: "'+uq.timezone+'", time: "'+date.toFormat('YYYY-MM-DD HH24:MI:SS')+'", lang: "'+uq.lang+'", user_id: "'+uq.user.id+'", plusfriendUserKey: "'+uq.user.properties.plusfriendUserKey+'", utterance: "'+convertNewline(requestedString)+'"';
    if(requestedString=='welcome' || requestedString=='Welcome' || requestedString=='웰컴'){
        res.status(200).send(buttonCardMessage.replace('TITLE', 'Hello, world!').replace('DESCRIPTION', '다음과 같이 입력해서 라텍 수식을 이미지로 변환할 수 있습니다.\\n〈tex [equation]〉\\n도움말을 원하면 〈도움말〉을 입력해주세요.')
        .replace('THUMBNAIL_URL', local+':'+port+'/'+screenshotsDir+'latexbot-profile.png').replace('BUTTON_NAME', '도움말').replace('MESSAGE_TEXT', '도움말'));
        appendLog('{'+commonLog+'},\n');
    }
    else if(requestedString=='help' || requestedString=='Help' || requestedString=='도움말'){
        res.status(200).send(urlCardMessage.replace('TITLE', '도움말')
        .replace('DESCRIPTION', '〈tex [equation]〉을 입력하면 라텍 수식을 이미지로 변환할 수 있습니다.\\n예시를 보고 싶다면, 〈예시〉를 입력하세요.\\n소스 코드를 보고 싶다면, 〈깃허브〉를 입력하세요.\\n라텍 문법에 대해 알고 싶다면, 아래 버튼을 누르세요. 위키백과로 연결됩니다.')
        .replace('THUMBNAIL_URL', local+':'+port+'/'+screenshotsDir+'latexbot-banner.jpg').replace('BUTTON_NAME', 'TeX 문법')
        .replace('WEB_URL', 'https://ko.wikipedia.org/wiki/%EC%9C%84%ED%82%A4%EB%B0%B1%EA%B3%BC:TeX_%EB%AC%B8%EB%B2%95'));
        appendLog('{'+commonLog+'},\n');
    }
    else if(requestedString=='github' || requestedString=='Github' || requestedString=='깃허브'){
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', 'https://github.com/gkm42917/kakaotalk-latexbot'));
        appendLog('{'+commonLog+'},\n');
    }
    else if(requestedString=='example' || requestedString=='Example' || requestedString=='ex' || requestedString=='Ex' || requestedString=='예시'){
        res.status(200).send(JSON.stringify({
          "version": "2.0",
          "template": {
            "outputs": [
              {
                "simpleText": {
                  "text": "예시 목록"
                }
              }
            ],
            "quickReplies": [
              {
                "messageText": "tex ax^2+bx+c = 0",
                "action": "message",
                "label": "이차방정식"
              },
              {
                "messageText": "tex \\sin2\\theta = 2\\sin\\theta\\cos\\theta",
                "action": "message",
                "label": "삼각함수 덧셈 정리"
              },
              {
                "messageText": "tex \\frac{a+b}{2} \\geq \\sqrt{ab}",
                "action": "message",
                "label": "산술-기하 평균 부등식"
              },
              {
                "messageText": "tex \\sum_{k=1}^na_n",
                "action": "message",
                "label": "수열의 합"
              },
              {
                "messageText": "tex (a,n)=1 \\Longrightarrow a^{\\varphi(n)} \\equiv 1 \\pmod{n}",
                "action": "message",
                "label": "오일러 정리"
              }
            ]
          }
        }));
        appendLog('{'+commonLog+'},\n');
    }
    else if(requestedString=='tex' || requestedString=='Tex'){
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', '원하는 수식을 뒤에 넣어주세요.'));
        appendLog('{'+commonLog+'},\n');
    }
    else if(requestedString.slice(0, 4)=='tex ' || requestedString.slice(0, 4)=='Tex '){
        // Ensure valid inputs
        if(requestedString.slice(4)!=''){ //if(req.body.latexInput)
            if(true){ //if(validScales.includes(req.body.outputScale))
                if(true){ //if(validFormats.includes(req.body.outputFormat))
                    const id = generateID(); // Generate unique ID for filename

                    let eqnInput = requestedString.slice(4);
                    if(/\\\\(?!$)/.test(eqnInput) && !eqnInput.includes("&")){ // if any "\\" not at EOF, unless intentionally aligned with &
                        eqnInput = '&'+eqnInput.replace(/\\\\(?!$)/g, "\\\\&"); // replace any "\\" not at EOF with "\\&", to enforce left alignment
                    }

                    shell.mkdir(`${tempDirRoot}${id}`);

                    const document = documentTemplate.replace('EQUATION', eqnInput);
                    fs.writeFileSync(`${tempDirRoot}${id}/equation.tex`, document); // Write generated .tex file

                    let result = {};

                    let finalDockerCMD = dockerCMD.replace('TEMP_DIR_NAME', `${tempDirRoot}${id}`);
                    finalDockerCMD = finalDockerCMD.replace('OUTPUT_SCALE', '10.0'); //'10.0' instead validScalesInternal[validScales.indexOf(req.body.outputScale)]

                    const fileFormat = 'jpg'; //'jpg' instead req.body.outputFormat.toLowerCase()

                    // Asynchronously compile and render the LaTeX to an image
                    shell.exec(finalDockerCMD, {async: true}, function(){
                        if(fs.existsSync(`${tempDirRoot}${id}/equation.svg`)){
                            if(fileFormat==='svg'){ // Converting to SVG, no further processing required
                                shell.cp(`${tempDirRoot}${id}/equation.svg`, `${outputDir}img-${id}.svg`);
                                result.imageURL = `${httpOutputURL}img-${id}.svg`;
                            }
                            else{
                                // Convert svg to png/jpg
                                let finalSvgToImageCMD = svgToImageCMD.replace('SVG_FILE_NAME', `${tempDirRoot}${id}/equation.svg`);
                                finalSvgToImageCMD = finalSvgToImageCMD.replace('OUT_FILE_NAME', `${tempDirRoot}${id}/equation.${fileFormat}`);
                                if(fileFormat==='jpg'){ // Add a white background for jpg images
                                    finalSvgToImageCMD += ' "svg {background: white}"';
                                }
                                shell.exec(finalSvgToImageCMD);

                                // Ensure conversion was successful; eg. fails if `svgexport` or `imagemin` is not installed
                                if(fs.existsSync(`${tempDirRoot}${id}/equation.${fileFormat}`)){
                                    // Compress the resultant image
                                    let finalImageMinCMD = imageMinCMD.replace('IN_FILE_NAME', `${tempDirRoot}${id}/equation.${fileFormat}`);
                                    finalImageMinCMD = finalImageMinCMD.replace('OUT_FILE_NAME', `${tempDirRoot}${id}/equation_compressed.${fileFormat}`);
                                    shell.exec(finalImageMinCMD);

                                    // Final image
                                    shell.cp(`${tempDirRoot}${id}/equation_compressed.${fileFormat}`, `${outputDir}img-${id}.${fileFormat}`);

                                    result.imageURL = `${httpOutputURL}img-${id}.${fileFormat}`;
                                }
                                else{
                                    result.error = `Error SVG 파일을 ${fileFormat.toUpperCase()} 이미지로 변환할 수 없습니다.`;
                                }
                            }
                        }
                        else{
                            result.error = 'Error 라텍을 이미지로 변환할 수 없습니다. 입력 값이 유효한지 확인하세요.';
                        }

                        shell.rm('-r', `${tempDirRoot}${id}`); // Delete temporary files for this conversion

                        if(result.error==undefined){
                            console.log('equation "'+requestedString.slice(4)+'" is converted in '+local+':'+port+'/'+result.imageURL);
                            res.status(200).send(imageMessage.replace('IMAGE_URL', local+':'+port+'/'+result.imageURL));
                            appendLog('{'+commonLog+', texUrl: "'+local+':'+port+'/'+result.imageURL+'"},\n');
                        }
                        else{
                            res.status(200).send(textMessage.replace('TEXT_MESSAGE', result.error));
                            appendLog('{'+commonLog+', errorMessage: "'+result.error+'"},\n');
                        }
                    });

                }
                else{
                    res.status(200).send(textMessage.replace('TEXT_MESSAGE', '유효하지 않은 이미지 포맷입니다.'));
                    appendLog('{'+commonLog+', errorMessage: "유효하지 않은 이미지 포맷입니다."},\n');
                }
            }
            else{
                res.status(200).send(textMessage.replace('TEXT_MESSAGE', '유효하지 않은 크기입니다.'));
                appendLog('{'+commonLog+', errorMessage: "유효하지 않은 이미지 크기입니다."},\n');
            }
        }
        else{
            res.status(200).send(textMessage.replace('TEXT_MESSAGE', '라텍이 입력되지 않았습니다.'));
            appendLog('{'+commonLog+', errorMessage: "라텍이 입력되지 않았습니다.",}\n');
        }
    }
    else{
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', '아직 라텍 수식 변환 이외의 기능은 없습니다.'));
        appendLog('{'+commonLog+'},\n');
    }
});

// Start the server
app.listen(port, function(){
    console.log(`Latex2image listening on port ${port}`);
});

function generateID(){ // Generate a random 16-char hexadecimal ID
    let output = '';
    for(let i = 0; i < 16; i++){
        output += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
    }
    return output;
}

function appendLog(data){
    fs.appendFile('log.txt', data, function(err){
        if(err) throw err;
    });
}

function convertNewline(data){
    return data.replace(/\n/g, '\\n');
}