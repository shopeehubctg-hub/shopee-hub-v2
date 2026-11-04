'use client';
import type {ReactNode} from 'react';
import {marketFromPlatform,MARKET_CONFIG} from './markets';
/** The current automatic pricing engine supports MY only. Country navigation never changes its fee assumptions. */
export function CalculatorCountryAvailability({platform,children,onOpenPackages}:{platform?:string;children:ReactNode;onOpenPackages?:()=>void}){
 const market=marketFromPlatform(platform);
 if(market==='MY')return <>{children}</>;
 const country=MARKET_CONFIG[market].name;
 return <section className="card" role="status"><h3>{country} pricing</h3><p>Automatic pricing is not available for {country}. Set this country’s prices in Packages &amp; Pricing.</p>{onOpenPackages&&<button type="button" onClick={onOpenPackages}>Open Packages &amp; Pricing</button>}</section>;
}
