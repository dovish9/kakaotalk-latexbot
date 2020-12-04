# kakaotalk-latexbot
`latexbot's skill server for kakao open builder`

<img src = "./screenshots/latexbot-profile.png" width="50%">

It does not work independently. Only with kakao open builder.

I made it by referring to [Joeraut](https://joeraut.com/)'s [work](https://github.com/joeraut/latex2image-web).

## Live Demo

Only when I run it be the service accessible at [https://pf.kakao.com/_EaxixlK](https://pf.kakao.com/_EaxixlK).

## Requirements

### Operating system

I used Ubuntu 18.04. Other Linux distributions should work without problems.

### Docker

[Docker CE](https://docs.docker.com/engine/install/ubuntu/) with [non-root user support](https://docs.docker.com/engine/install/linux-postinstall/).

### [latex-docker](https://github.com/blang/latex-docker)

It's a docker image containing the required LaTeX packages preinstalled.

Pull the image:

```
$ docker pull blang/latex:ubuntu
```

### Node.js

I installed Node.js via nvm lts v10.14.2, anything newer should be fine.

After cloning or downloading this project, run the following to install local dependencies from npm:

```
$ cd my_path_of_kakaotalk-latexbot
$ npm install
```

And install two global packages.

```
$ npm install -g svg-png-converter
$ npm install -g imagemin-cli
```

## How to run

change here as yours:
```javascript
const local = '' //write local's IP
```

and run:

```
$ node app.js
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.