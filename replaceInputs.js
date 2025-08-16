(function(){
    console.log("🔄 replaceInputs.js запущен");

    setTimeout(()=>{
        document.querySelectorAll('.relative.w-14').forEach(block=>{
            const topCounter = block.querySelector('.absolute.z-10');
            const input = block.querySelector('input[type=number]');
            
            if(topCounter && input){
                // создаём новый div вместо input
                const newDiv = document.createElement('div');
                newDiv.className = input.className.replace(/\barrows-none\b/, '').trim();
                newDiv.textContent = topCounter.textContent.trim();

                // удаляем старые элементы
                topCounter.remove();
                input.replaceWith(newDiv);
            }
        });
    },1000);
})();
