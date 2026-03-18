document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("pre").forEach((block) => {
    hljs.highlightBlock(block);
    block.classList.add('p-6');
  });
});
