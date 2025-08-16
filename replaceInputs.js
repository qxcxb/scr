(function waitAndReplace(){
  const blocks = document.querySelectorAll('div.relative.w-14');

  if(blocks.length === 0){
    // Если блоки ещё не появились – пробуем снова через 500мс
    return setTimeout(waitAndReplace, 500);
  }

  blocks.forEach(block=>{
    const topCounter = block.querySelector('div.absolute.z-10');
    const input = block.querySelector('input[type=number]');
    if(topCounter && input){
      const newDiv = document.createElement('div');
      newDiv.className = input.className.replace(/\barrows-none\b/, '').trim();
      newDiv.textContent = topCounter.textContent.trim();

      topCounter.remove();
      input.replaceWith(newDiv);
    }
  });
})();
