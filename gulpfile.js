var fs = require('fs');
var async = require('async');
var gulp = require('gulp');
var eslint = require('gulp-eslint');
var gutil = require('gulp-util');
var concat = require('gulp-concat');
var cleanCSS = require('gulp-clean-css');
var rename = require("gulp-rename");
var webpack = require('webpack');
var uglify = require('uglify-js');
var rimraf = require('rimraf');
var argv = require('yargs').argv;
var child_exec = require('child_process').exec;

var ENTRY             = './timeline.js';
var DIST              = __dirname + '/dist';
var TIMELINE_JS            = 'timeline.js';
var TIMELINE_MAP           = 'timeline.map';
var TIMELINE_MIN_JS        = 'timeline.min.js';
var TIMELINE_CSS           = 'timeline.css';
var TIMELINE_MIN_CSS       = 'timeline.min.css';

var INDIVIDUAL_CSS_BUNDLES = [
  {entry: ['./lib/shared/**/*.css', './lib/timeline/**/*.css'], filename: 'timeline.min.css'},
];

var webpackModule = {
  loaders: [
    {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'babel-loader',
      query: {
        cacheDirectory: true, // use cache to improve speed
        babelrc: true // use the .baberc file
      }
    }
  ],

  // exclude requires of moment.js language files
  wrappedContextRegExp: /$^/
};

var webpackConfig = {
  entry: ENTRY,
  output: {
    library: 'timeline',
    libraryTarget: 'umd',
    path: DIST,
    filename: TIMELINE_JS,
    sourcePrefix: '  '
  },
  module: webpackModule,
  cache: true,

  // generate details sourcempas of webpack modules
  devtool: 'source-map'

  //debug: true,
  //bail: true
};

var uglifyConfig = {
  outSourceMap: TIMELINE_MAP,
  output: {
    comments: /@license/
  }
};

// create a single instance of the compiler to allow caching
var compiler = webpack(webpackConfig);

/**
 * Callback for handling errors for a compiler run
 *
 * @param {object} err
 * @param {objects} stats
 */
function handleCompilerCallback (err, stats) {
  if (err) {
    gutil.log(err.toString());
  }

  if (stats && stats.compilation && stats.compilation.errors) {
    // output soft errors
    stats.compilation.errors.forEach(function (err) {
      gutil.log(err.toString());
    });

    if (err || stats.compilation.errors.length > 0) {
      gutil.beep(); // TODO: this does not work on my system
    }
  }
}

// clean the dist/img directory
gulp.task('clean', function (cb) {
  rimraf(DIST + '/img', cb);
});

gulp.task('bundle-js', function (cb) {
  compiler.run(function (err, stats) {
    handleCompilerCallback(err, stats);
    cb();
  });
});


// bundle and minify css
gulp.task('bundle-css', function () {
  return gulp.src('./lib/**/*.css')
      .pipe(concat(TIMELINE_CSS))
      .pipe(gulp.dest(DIST))
      // TODO: nicer to put minifying css in a separate task?
      .pipe(cleanCSS())
      .pipe(rename(TIMELINE_MIN_CSS))
      .pipe(gulp.dest(DIST));
});

gulp.task('minify', ['bundle-js'], function (cb) {
  var result = uglify.minify([DIST + '/' + TIMELINE_JS], uglifyConfig);

  // note: we add a newline '\n' to the end of the minified file to prevent
  //       any issues when concatenating the file downstream (the file ends
  //       with a comment).
  fs.writeFileSync(DIST + '/' + TIMELINE_MIN_JS, result.code + '\n');
  fs.writeFileSync(DIST + '/' + TIMELINE_MAP, result.map.replace(/"\.\/dist\//g, '"'));

  cb();
});

gulp.task('bundle', ['bundle-js', 'bundle-css']);

// read command line arguments --bundle and --minify
var bundle = 'bundle' in argv;
var minify = 'minify' in argv;
var watchTasks = [];
if (bundle || minify) {
  // do bundling and/or minifying only when specified on the command line
  watchTasks = [];
  if (bundle) watchTasks.push('bundle');
  if (minify) watchTasks.push('minify');
}
else {
  // by default, do both bundling and minifying
  watchTasks = ['bundle', 'minify'];
}

// The watch task (to automatically rebuild when the source code changes)
gulp.task('watch', watchTasks, function () {
  gulp.watch(['index.js', 'lib/**/*'], watchTasks);
});


//
// Linting usage:
//
//    > gulp lint
// or > npm run lint
//
gulp.task('lint', function () {
  return gulp.src(['lib/**/*.js', '!node_modules/**'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});


// Generate the documentation files
gulp.task('docs', function(cb) {
  var targetDir = 'gen/docs';

  // Not sure if this is the best way to handle 'cb'; at least it works.
  var hasError = false;
  var onError = function(error) {
    if (error !== undefined && error !== null) {
      console.error('Error while running task: ' + error);
      hasError = true;
      cb();
    }
  }

  rimraf(__dirname + '/' + targetDir, onError);  // Clean up previous generation

  if (!hasError) {
    var params = '-c ./jsdoc.json -r -t docs -d ' + targetDir;
    child_exec('node ./node_modules/jsdoc/jsdoc.js ' + params + ' lib', undefined, cb);
  }
});

// The default task (called when you run `gulp`)
gulp.task('default', ['clean', 'bundle', 'minify']);
