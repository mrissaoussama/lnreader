export const createScrollJS = (
  autoScroll: boolean,
  autoScrollInterval: number,
  pauseAutoscrollOnTap: boolean,
  progressBarPosition: 'left' | 'right' | 'bottom',
  showScrollPercentage: boolean,
  themePrimaryColor: string,
) => {
  return `
    (function() {
      // --- Auto Scroll ---
      if (window.lnReaderAutoScroll) {
        cancelAnimationFrame(window.lnReaderAutoScroll);
        window.lnReaderAutoScroll = null;
      }

      // Stop auto-scroll on user interaction (if setting enabled)
      if (${pauseAutoscrollOnTap} && !window.lnReaderScrollListenersAttached) {
        const stopScroll = () => {
          if (window.lnReaderAutoScroll) {
            cancelAnimationFrame(window.lnReaderAutoScroll);
            window.lnReaderAutoScroll = null;
          }
        };
        window.addEventListener('touchstart', stopScroll);
        window.addEventListener('wheel', stopScroll);
        window.lnReaderScrollListenersAttached = true;
      }

      if (${autoScroll}) {
        const duration = ${autoScrollInterval}; 
        const pixelsPerFrame = window.innerHeight / (duration * 60);
        
        function step() {
          // Pause if menu is open or user is touching (unless pauseAutoscrollOnTap is true, which is handled separately)
          if (!window.lnReaderIsMenuOpen && !window.lnReaderIsTouching) {
            window.scrollBy(0, pixelsPerFrame);
          }
          if ((window.innerHeight + window.scrollY) < document.body.offsetHeight) {
            window.lnReaderAutoScroll = requestAnimationFrame(step);
          }
        }
        window.lnReaderAutoScroll = requestAnimationFrame(step);
      }

      // Handle touch to pause temporarily (for manual scrolling)
      if (!window.lnReaderTouchListenersAttached) {
          window.addEventListener('touchstart', () => { 
            window.lnReaderIsTouching = true; 
          }, { passive: true });
          window.addEventListener('touchend', () => { 
            window.lnReaderIsTouching = false; 
          }, { passive: true });
          window.addEventListener('touchcancel', () => { 
            window.lnReaderIsTouching = false; 
          }, { passive: true });
          window.lnReaderTouchListenersAttached = true;
      }

      // --- Progress Bar ---
      let bar = document.getElementById('lnreader-custom-progress');
      if (!${showScrollPercentage}) {
        if (bar) bar.remove();
      } else {
        if (!bar) {
          bar = document.createElement('div');
          bar.id = 'lnreader-custom-progress';
          bar.style.position = 'fixed';
          bar.style.zIndex = '9999';
          bar.style.backgroundColor = '${themePrimaryColor}';
          document.body.appendChild(bar);
        }
        
        const pos = '${progressBarPosition}'.toLowerCase();
        // Reset
        bar.style.top = 'auto';
        bar.style.bottom = 'auto';
        bar.style.left = 'auto';
        bar.style.right = 'auto';
        bar.style.width = 'auto';
        bar.style.height = 'auto';

        if (pos === 'bottom') {
            bar.style.bottom = '0';
            bar.style.left = '0';
            bar.style.height = '4px';
            bar.style.width = '0%';
        } else if (pos === 'left') {
            bar.style.top = '0';
            bar.style.left = '0';
            bar.style.width = '4px';
            bar.style.height = '0%';
        } else if (pos === 'top') {
            bar.style.top = '0';
            bar.style.left = '0';
            bar.style.height = '4px';
            bar.style.width = '0%';
        } else { // right (default)
            bar.style.top = '0';
            bar.style.right = '0';
            bar.style.width = '4px';
            bar.style.height = '0%';
        }
        
        const updateProgress = () => {
          const scrollTop = window.scrollY;
          const docHeight = document.body.scrollHeight;
          const winHeight = window.innerHeight;
          const scrollPercent = scrollTop / (docHeight - winHeight);
          const pct = Math.min(100, Math.max(0, scrollPercent * 100)) + '%';
          
          if (pos === 'bottom' || pos === 'top') {
            bar.style.width = pct;
            bar.style.height = '4px';
          } else {
            bar.style.height = pct;
            bar.style.width = '4px';
          }
        };
        
        if (window.lnReaderUpdateProgress) {
            window.removeEventListener('scroll', window.lnReaderUpdateProgress);
        }
        window.lnReaderUpdateProgress = updateProgress;
        window.addEventListener('scroll', window.lnReaderUpdateProgress);
        updateProgress();
      }
    })();
  `;
};
