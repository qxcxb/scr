document.querySelectorAll('h4').forEach(h4 => {
    if (h4.querySelector('.ver_text_time')) {
        h4.remove();
    }
});
console.log('Элемент удалён!');
