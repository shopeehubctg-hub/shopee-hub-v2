"use client";
import {Component,type ReactNode} from 'react';
export function ModuleLoading(){return <div className="card" role="status" aria-busy="true">Loading module…</div>;}
export class DashboardModuleBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<div className="card" role="alert"><p>This module could not be loaded.</p><button type="button" onClick={()=>window.location.reload()}>Reload page</button></div>:this.props.children;}
}
