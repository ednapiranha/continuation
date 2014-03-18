define([], function () {
  'use strict';

  function VideoShooter () {
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var video = $('video');
    context.scale(-1, 1); // mirror flip preview back to the normal direction

    canvas.width = 400;
    canvas.height = 300;

    this.getShot = function () {
      context.drawImage(video[0], 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.4);
    };
  }

  return VideoShooter;
});
