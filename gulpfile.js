var gulp   = require('gulp');
var lambda = require('gulp-awslambda');
var zip    = require('gulp-zip');
var install = require('gulp-install');
var rename = require('gulp-rename');
var del = require('del');
var runSequence = require('run-sequence');

var lambda_properties = {
  FunctionName: 'SF-ScrapeReviews', /* required */
  Description: 'Scrape Scriptfodder for reiews and store them in an Orchestrate database',
  MemorySize: 128,
  Role: 'arn:aws:iam::277555456074:role/lambda_basic_execution',
  Timeout: 20
};

gulp.task('clean', function(cb) {
  return del(['./dist', 'dist.zip']);
});

gulp.task('js', function() {
  return gulp.src('index.js')
    .pipe(gulp.dest('dist/'))
});

gulp.task('npm', function() {
  return gulp.src('./package.json')
    .pipe(gulp.dest('./dist/'))
    .pipe(install({production: true}));
});

gulp.task('env', function() {
  return gulp.src('./config.env.production')
    .pipe(rename('.env'))
    .pipe(gulp.dest('./dist'));
});

gulp.task('zip', function() {
  return gulp.src(['dist/**/*', '!dist/package.json', 'dist/.*'])
    .pipe(zip('dist.zip'))
    .pipe(gulp.dest('./'));
});

gulp.task('upload', function() {
    return gulp.src('dist.zip')
        .pipe(lambda(lambda_properties, {
          region: 'eu-west-1'
        }))
        .pipe(gulp.dest('.'));
});

gulp.task('default', function(callback) {
  return runSequence(
    'clean',
    ['js', 'npm', 'env'],
    'zip',
    'upload',
    callback
  );
});
