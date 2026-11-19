import {useLayoutEffect,useState,type CSSProperties} from 'react';

export function useInventoryMenuStyle(input:HTMLInputElement|null) {
 const [menuStyle,setMenuStyle]=useState<CSSProperties>({});
 useLayoutEffect(()=>{
  if(!input)return;
  const positionMenu=()=>{
   const rect=input.getBoundingClientRect(),viewport=window.visualViewport;
   const top=(viewport?.offsetTop??0)+8,bottom=(viewport?.offsetTop??0)+(viewport?.height??window.innerHeight)-8;
   const container=input.closest('.package-form')?.getBoundingClientRect();
   const ceiling=Math.max(top,container?.top??top),floor=Math.min(bottom,container?.bottom??bottom);
   const above=Math.max(0,rect.top-ceiling-4),below=Math.max(0,floor-rect.bottom-4);
   const upwards=below<280&&above>below;
   const width=Math.min(Math.max(rect.width,280),(viewport?.width??window.innerWidth)-16);
   setMenuStyle({position:'fixed',top:upwards?rect.top-4:rect.bottom+4,left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),width,minWidth:0,maxHeight:Math.min(330,upwards?above:below),transform:upwards?'translateY(-100%)':undefined});
  };
  positionMenu();
  window.addEventListener('scroll',positionMenu,true);window.addEventListener('resize',positionMenu);
  window.visualViewport?.addEventListener('resize',positionMenu);
  return()=>{window.removeEventListener('scroll',positionMenu,true);window.removeEventListener('resize',positionMenu);window.visualViewport?.removeEventListener('resize',positionMenu);};
 },[input]);
 return menuStyle;
}
