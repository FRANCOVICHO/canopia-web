(() => {
  const link=document.querySelector('#courier-entry');
  if(!link)return;
  async function check(){
    if(document.hidden)return;
    try{
      const response=await fetch('/api/courier?action=me',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(8000)});
      const data=await response.json();link.hidden=!response.ok||!data.allowed;
    }catch{link.hidden=true;}
  }
  check();addEventListener('pageshow',check);document.addEventListener('visibilitychange',check);
  setInterval(check,30000);
})();
