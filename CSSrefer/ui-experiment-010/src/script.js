let rivCanvas = document.getElementsByClassName('js-riv-canvas');

const r1 = new rive.Rive({
  src: 'https://anim-icons.s3.amazonaws.com/10/comment-4.riv',
  canvas: rivCanvas[0],
  autoplay: false,
  onLoad: () => {
    r1.resizeDrawingSurfaceToCanvas();
    triggerAnim(r1, rivCanvas[0].closest('button'), 'comment');
  }
});

const r2 = new rive.Rive({
  src: 'https://anim-icons.s3.amazonaws.com/10/ask-ai-2.riv',
  canvas: rivCanvas[1],
  autoplay: false,
  onLoad: () => {
    r2.resizeDrawingSurfaceToCanvas();
    triggerAnim(r2, rivCanvas[1].closest('button'), 'askAi');
  }
});

const r3 = new rive.Rive({
  src: 'https://anim-icons.s3.amazonaws.com/10/delete.riv',
  canvas: rivCanvas[2],
  autoplay: false,
  onLoad: () => {
    r3.resizeDrawingSurfaceToCanvas();
    triggerAnim(r3, rivCanvas[2].closest('button'), 'delete');
  }
});

const r4 = new rive.Rive({
  src: 'https://anim-icons.s3.amazonaws.com/10/duplicate.riv',
  canvas: rivCanvas[3],
  autoplay: false,
  onLoad: () => {
    r4.resizeDrawingSurfaceToCanvas();
    triggerAnim(r4, rivCanvas[3].closest('button'), 'duplicate');
  }
});

const r5 = new rive.Rive({
  src: 'https://anim-icons.s3.amazonaws.com/10/copy-link.riv',
  canvas: rivCanvas[4],
  autoplay: false,
  onLoad: () => {
    r5.resizeDrawingSurfaceToCanvas();
    triggerAnim(r5, rivCanvas[4].closest('button'), 'copyLink');
  }
});

function triggerAnim(rivObj, btn, stateMachine) {
  btn.addEventListener('mouseenter', function() {
    rivObj.play(stateMachine);
  });
  btn.addEventListener('mouseleave', function() {
    rivObj.reset({stateMachines: stateMachine});
  });
}