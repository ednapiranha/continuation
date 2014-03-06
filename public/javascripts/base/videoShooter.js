define(['Animated_GIF'], function (Animated_GIF) {
  'use strict';

  function VideoShooter (videoElement) {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var video = $('video');
    context.scale(-1, 1); // mirror flip preview back to the normal direction

    canvas.width = videoElement.width;
    canvas.height = videoElement.height;

    this.getShot = function (callback) {
      context.drawImage(video[0], 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.5));
    };
  }

  return VideoShooter;
});
