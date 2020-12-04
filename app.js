const fs = require('fs');
const shell = require('shelljs');
const express = require('express');

const local = '' //local's IP
const port = 3001;

const staticDir = 'static/';
const tempDirRoot = 'temp/';
const outputDir = 'output/';
const httpOutputURL = 'output/';

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
const svgToImageCMD = 'svg2png --input SVG_FILE_NAME --output OUT_FILE_NAME --format png';
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

// POST call for LaTeX to image conversion. Convert and return image URL or error message
app.post('/convert', function(req, res){
    // Image message format
    let imageMessage = JSON.stringify({
        version: "2.0",
        template: {
          outputs: [
            {
              simpleImage: {
                imageUrl: "IMAGE_URL",
                altText: "IMAGE_ID"
              }
            }
          ]
        }
      });
    // Text message for invalid inputs
    let textMessage = JSON.stringify({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "TEXT_MESSAGE"
            }
          }
        ]
      }
    });
    if(req.body.userRequest.utterance.slice(-1)=="\n"){
        requestedString = req.body.userRequest.utterance.slice(0, -1);
    }
    else{
        requestedString = req.body.userRequest.utterance;
    }
    if(requestedString=="help" || requestedString=="도움말"){
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', '〈tex [equation]〉을 입력하면 라텍 수식을 이미지로 변환할 수 있습니다. 소스 코드를 보고 싶다면, 〈깃허브〉를 입력하세요.'));
    }
    else if(requestedString=="github" || requestedString=="깃허브"){
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', 'https://github.com/gkm42917/kakaotalk-latexbot'));
    }
    else if(requestedString=="tex"){
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', '원하는 수식을 뒤에 넣어주세요.'));
    }
    else if(requestedString.slice(0, 4)=="tex "){
        // Ensure valid inputs
        if(requestedString.slice(4)!=""){ //if(req.body.latexInput)
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
                    finalDockerCMD = finalDockerCMD.replace('OUTPUT_SCALE', '5.0'); //'5.0' instead validScalesInternal[validScales.indexOf(req.body.outputScale)]

                    const fileFormat = 'png'; //'png' instead req.body.outputFormat.toLowerCase()

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
                            console.log('equation "'+requestedString.slice(4)+'" is converted in '+local+':3001/'+result.imageURL);
                            res.status(200).send(imageMessage.replace('IMAGE_URL', local+':3001/'+result.imageURL).replace('IMAGE_ID', id));
                        }
                        else{
                            res.status(200).send(textMessage.replace('TEXT_MESSAGE', result.error));
                        }
                    });

                }
                else{
                    res.status(200).send(textMessage.replace('TEXT_MESSAGE', '유효하지 않은 이미지 포맷입니다.'));
                }
            }
            else{
                res.status(200).send(textMessage.replace('TEXT_MESSAGE', '유효하지 않은 크기입니다.'));
            }
        }
        else{
            res.status(200).send(textMessage.replace('TEXT_MESSAGE', '라텍이 입력되지 않았습니다.'));
        }
    }
    else{
        res.status(200).send(textMessage.replace('TEXT_MESSAGE', '아직 라텍 수식 변환 이외의 기능은 없습니다.'));
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