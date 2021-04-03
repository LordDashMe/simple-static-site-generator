/**
 * The Simple Static Site Generator - Core File
 * 
 * Yes, simple static site generator is using gulp to automate tasks!
 * feel free to visit some of the reference listed below :-) TY!
 * 
 * Gulp Main Config Setup.
 *  - Reference: 
 *    - https://github.com/gulpjs/gulp#sample-gulpfilejs
 *    - https://github.com/gulpjs/gulp
 * 
 * Babel Setup for Browserlist.
 *  - Reference:
 *    - https://github.com/browserslist/browserslist
 *    - https://babeljs.io/docs/en/babel-preset-env#browserslist-integration
 * 
 * Browser List Compatibiltiy Setup.
 *  - Reference: https://stackoverflow.com/a/43076327
 * 
 * Markdown Processing.
 *  - Reference: https://github.com/sindresorhus/gulp-markdown
 * 
 * Requirement(s):
 *  - Node.js from v8 up to latest.
 *  - npm from v5 up to latest.
 * 
 * To avoid some issue on variable reference we used IIFE strategy.
 * 
 * @author Joshua Clifford Reyes<reyesjoshuaclifford@gmail.com>
 */
var fs = require('fs');
var del =  require('del');
var gulp = require('gulp');
var util = require('util');
var marked = require('marked');
var sass = require('gulp-sass');
var gzip = require('gulp-gzip');
var through = require('through2');
var babel = require('gulp-babel');
var concat = require('gulp-concat');
var rename = require('gulp-rename');
var uglify = require('gulp-uglify');
var cleanCSS = require('gulp-clean-css');
var autoPrefixer = require('gulp-autoprefixer');

/**
 * Read scripts configuration file.
 */
var scriptsConfig = JSON.parse(fs.readFileSync('_scripts.json', 'utf8'));

/**
 * Read styles configuration file.
 */
var stylesConfig = JSON.parse(fs.readFileSync('_styles.json', 'utf8'));

/**
 * Read htmls configuration file.
 */
var htmlsConfig = JSON.parse(fs.readFileSync('_htmls.json', 'utf8'));

/**
 * Prepare hardcoded path setup for tasks.
 */
var paths = {
  scripts: {
    src: 'src/js/**/*.*',
    dest: {
      plugins: 'dist/js/plugins',
      third_party: 'dist/js/third_party',
      commons: 'dist/js/commons',
      components: 'dist/js/components',
      pages: 'dist/js/pages/'
    }
  },
  styles: {
    src: 'src/scss/**/*.*',
    dest: {
      plugins: 'dist/css/plugins',
      third_party: 'dist/css/third_party',
      commons: 'dist/css/commons',
      components: 'dist/css/components',
      pages: 'dist/css/pages/'
    }
  },
  markdowns: {
    src: 'src/md/**/*.*',
    dest: 'dist/md/'
  },
  htmls: {
    src: 'src/html/**/*.*',
    dest: {
      pages: 'dist/'
    }
  }
};

/**
 * Helpers.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * File Stream Extensions.
 */
var fileStreamMarker = function (chunk, enc, callback) {

  var contents = '__MARKED_FILE:' + chunk.path.replace(chunk._cwd, '') + '__';
  contents += chunk.contents.toString();
  
  chunk.contents = new Buffer.from(contents);
  callback(null, chunk);

};

var htmlCompiler = function (chunk, enc, callback) {
  
  var contents = chunk.contents.toString();
  var splitHtmls = contents.split('__SEPARATOR__');
  
  var pureHtmls = {};
  var alreadyImportedFiles = [];
  var html = '';

  var prepareHtmlFiles = function () {
    for (var x in splitHtmls) {
      var markedFile = splitHtmls[x].match(/__MARKED_FILE:\/([\s\S]*?)__/g)[0];
      if (markedFile) {
        pureHtmls[markedFile.replace('__MARKED_FILE:/', '').replace('__', '')] = splitHtmls[x].replace(markedFile, '');
      }
    }
  };

  var parseImport = function () {
    for (var x in pureHtmls) {
      var importRegexRule = /\{\@IMPORT\(\'([\s\S]*?)\'\)\}/g;
      while (pureHtmls[x].match(importRegexRule)) {
        var importFiles = pureHtmls[x].match(importRegexRule);
        for (var importFile in importFiles) {
          var importingFile = importFiles[importFile];
          var rawImportingFile = unescape(importingFile);
          var fileToImport = importingFile.replace('\{\@IMPORT\(\'', '').replace('\'\)\}', '');
          pureHtmls[x] = pureHtmls[x].replace(new RegExp(escapeRegExp(rawImportingFile), 'g'), 
            pureHtmls[fileToImport]
          );
          if (!alreadyImportedFiles.includes(fileToImport)) {
            alreadyImportedFiles.push(fileToImport);
          }
        }
      }
    }
  };

  var filterAlreadyImportedFiles = function () {
    for (var x in alreadyImportedFiles) {
      delete pureHtmls[alreadyImportedFiles[x]];
    }
  };

  var prepareHtmlContent = function () {
    for (var x in pureHtmls) {
      html += pureHtmls[x];
    }
    html = html.replace(/(\>[^\S]+)/g, '>').replace(/([^\S]+\<)/g, '<').replace(/\r?\n|\r/g, '');
  };

  var parseEnv = function () {
    var envRegexRule = /\{\@ENV\(\'([\s\S]*?)\'\)\}/g;
    var envs = html.match(envRegexRule);
    for (var env in envs) {
      var envToImport = envs[env].replace('\{\@ENV\(\'', '').replace('\'\)\}', '');
      html = html.replace(new RegExp(escapeRegExp((envs[env])), 'g'), process.env[envToImport]);
    }
  };

  prepareHtmlFiles();
  parseImport();
  filterAlreadyImportedFiles();
  prepareHtmlContent();
  parseEnv();

  chunk.contents = new Buffer.from(html);
  callback(null, chunk);

};

var markdownToHtmlCompiler = function (chunk, enc, callback) {

  const markPromise = util.promisify(marked);
  
  markPromise(chunk.contents.toString())
    .then((data) => {
      chunk.contents = new Buffer.from(data);
      callback(null, chunk);
    });

};

/**
 * Command for the scripts processing.
 */
function buildScripts() {

  var consoldatedTasks = [];

  for (var scriptConfig in scriptsConfig) {

    var files = scriptsConfig[scriptConfig];
    var module = scriptConfig;

    (function (files, module) {

      for (var file in files) {

        (function (file) {
          gulp.task(file + '_script_' + module + '_task', function () {
            return gulp.src(files[file], { sourcemaps: true })
              .pipe(babel())
              .pipe(uglify())
              .pipe(concat(file + '.js'))
              .pipe(rename({ suffix: '.min' }))
              .pipe(gulp.dest(paths.scripts.dest[module]));
          });
        })(file);
    
        // For GZIP version.
        (function (file) {
          gulp.task(file + '_script_gz_' + module + '_task', function () {
            return gulp.src(files[file], { sourcemaps: true })
              .pipe(babel())
              .pipe(uglify())
              .pipe(concat(file + '.gz'))
              .pipe(gzip({ append: false }))
              .pipe(gulp.dest(paths.scripts.dest[module]));
          });
        })(file);
    
        consoldatedTasks.push(file + '_script_' + module + '_task');
        consoldatedTasks.push(file + '_script_gz_' + module + '_task');

      }

    })(files, module);
  }

  gulp.task('build_scripts', 
    gulp.series(consoldatedTasks)
  );
}

/**
 * Command for the styles processing.
 */
function buildStyles() {

  var consoldatedTasks = [];

  for (var styleConfig in stylesConfig) {

    var files = stylesConfig[styleConfig];
    var module = styleConfig;

    (function (files, module) {

      for (var file in files) {

        (function (file) {
          gulp.task(file + '_style_' + module + '_task', function () {
            return gulp.src(files[file], { sourcemaps: true })
            .pipe(sass())
            .pipe(cleanCSS({level: {1: {specialComments: 0}}}))
            .pipe(autoPrefixer())
            .pipe(concat(file + '.css'))
            .pipe(rename({ suffix: '.min' }))
            .pipe(gulp.dest(paths.styles.dest[module]));
          });
        })(file);
    
        consoldatedTasks.push(file + '_style_' + module + '_task');

      }

    })(files, module);
  }

  gulp.task('build_styles',
    gulp.series(consoldatedTasks)
  );
}

/**
 * Command for the mardowns processing.
 */
function buildMarkdowns() {

  gulp.task('build_markdowns', function () {
    return gulp.src(paths.markdowns.src, { sourcemaps: true })
    .pipe(through.obj(markdownToHtmlCompiler))
    .pipe(rename({ extname: '.html' }))
    .pipe(gulp.dest(paths.markdowns.dest));
  });
}

/**
 * Command for the html processing.
 */
function buildHtmls() {

  var consolidatedTasks = [];

  for (var htmlConfig in htmlsConfig) {

    var files = htmlsConfig[htmlConfig];
    var module = htmlConfig;

    (function (files, module) {

      for (var file in files) {
        
        (function (file) {
          gulp.task(file + '_html_' + module + '_task', function () {
            return gulp.src(files[file], { sourcemaps: true })
            .pipe(through.obj(fileStreamMarker))
            .pipe(concat(file + '.html', { newLine: '__SEPARATOR__' }))
            .pipe(through.obj(htmlCompiler))
            .pipe(gulp.dest(paths.htmls.dest[module]));
          });
        })(file);

        consolidatedTasks.push(file + '_html_' + module + '_task');

      }

    })(files, module);
  }

  gulp.task('build_htmls',
    gulp.series(consolidatedTasks)
  );
}

/**
 * Command for the clean dist directory.
 */
function clean() {
  return del(['dist']);
}

/**
 * Register gulp task commands.
 */
buildScripts();
buildStyles();
buildMarkdowns();
buildHtmls();

exports.clean = clean;
exports.assets = gulp.series('build_scripts', 'build_styles', 'build_markdowns', 'build_htmls');

/**
 * Thanks for the Gulp Watch Hook, an easy life :-)
 * Every changes for scripts and styles will automatically fire
 * the build process for scripts and styles.
 */
exports.watch = function () {
  gulp.watch(paths.scripts.src, gulp.series('build_scripts'));
  gulp.watch(paths.styles.src, gulp.series('build_styles'));
  gulp.watch(paths.markdowns.src, gulp.series('build_markdowns'));
  gulp.watch(paths.htmls.src, gulp.series('build_htmls'));
};
