export const THEME_STORAGE_KEY = "oca-theme";

/** ຮັນກ່ອນ paint ເພື່ອບໍ່ໃຫ້ໜ້າຈໍກະພິບຂາວ; ຕ້ອງບໍ່ throw ແລະ ຕ້ອງຕົງກັບ logic ໃນ ThemeProvider. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=t==="dark"||((t!=="light")&&!!window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(d){r.classList.add("dark")}r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;

// script ນີ້ເພີ່ມ class dark ເທົ່ານັ້ນ; ການລຶບ class ເປັນໜ້າທີ່ຂອງ ThemeProvider.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
