// Select the appropriate static interface without requiring inline JavaScript.
document.addEventListener('DOMContentLoaded', () => {
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobile = mobileUserAgent.test(navigator.userAgent) || window.innerWidth <= 768;
  window.location.replace(isMobile ? 'mobile.html' : 'desktop.html');
});
