(function(){
    function waitForElement(selector, callback) {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
        } else {
            setTimeout(() => waitForElement(selector, callback), 300);
        }
    }

    waitForElement('h4 .ver_text_time', () => {
        document.querySelectorAll('h4').forEach(h4 => {
            if (h4.querySelector('.ver_text_time')) {
                h4.remove();
            }
        });
        console.log('Элемент h4 с датой удалён');
    });
})();
