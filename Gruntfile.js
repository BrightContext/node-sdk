/*global module */

module.exports = function(grunt) {

  'use strict';

  var defaultTask = ['jshint'];

  grunt.initConfig({
    jshint: {
      options: {
        jshintrc: 'jshint.json'
      },
      all: ['Gruntfile.js', 'bcc_*.js', 'tests/*.js']
    },

    watch: {
      core: {
        files: ['bcc_*.js'],
        tasks: ['jshint'],
        options: {
          interrupt: true
        }
      }
    },

    nodeunit: {
      all: ['tests/*.js']
    }
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  grunt.registerTask('default', defaultTask);
};
