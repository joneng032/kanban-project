export const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });

export const showToast = (message) => { 
    const el = document.getElementById('toast-notification'); 
    el.textContent = message; 
    el.classList.add('show'); 
    setTimeout(() => el.classList.remove('show'), 3000); 
};

export const getContrastYIQ = (hexcolor) => {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0,2),16);
    const g = parseInt(hexcolor.substr(2,2),16);
    const b = parseInt(hexcolor.substr(4,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? 'black' : 'white';
}

export const formatTime = (ms) => { 
    if (!ms) return '00:00:00'; 
    const s = Math.floor(ms / 1000); 
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; 
};