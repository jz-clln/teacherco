import {expect,it} from 'vitest';
import {completeBindings,suggestPeriodBindings} from '@/features/assisted-workflows/bindings';
import {emptyDefinition} from '@/features/report-card-mappings/model';
import type {Period} from '@/features/gradebook/model';
const definition=(labels:string[])=>({...emptyDefinition('a'.repeat(64)),periods:labels.map((label,i)=>({key:`period_${i+1}` as 'period_1',label}))});
const periods=(labels:string[]):Period[]=>labels.map((label,i)=>({id:`id-${i+1}`,key:`period_${i+1}`,label,position:i+1,status:'active'}));
it('connects generic Period 1-3 and T1-3 to Section terms by number, independent of position',()=>{
  for(const labels of [['Period 1','Period 2','Period 3'],['T1','T2','T3']])expect(suggestPeriodBindings(definition(labels),periods(['Term 1','Term 2','Term 3']).reverse())).toEqual({period_1:'id-1',period_2:'id-2',period_3:'id-3'});
});
it('connects Q1-Q4 and generic periods to a quarter layout',()=>{
  expect(Object.keys(suggestPeriodBindings(definition(['Q1','Q2','Q3','Q4']),periods(['Quarter 1','Quarter 2','Quarter 3','Quarter 4'])))).toHaveLength(4);
  expect(suggestPeriodBindings(definition(['Period 1']),periods(['Quarter 1','Quarter 2']))).toEqual({period_1:'id-1'});
});
it('does not guess across term/quarter families, ambiguous labels, inactive periods or custom layouts',()=>{
  for(const labels of [['Quarter 1'],['Term 1','T1'],['Term 1','Quarter 1'],['Autumn','Spring']])expect(suggestPeriodBindings(definition(['Term 1']),periods(labels))).toEqual(labels.includes('Term 1')?{period_1:'id-1'}:{});
  expect(suggestPeriodBindings(definition(['Period 1']),periods(['Term 1','Quarter 1']))).toEqual({});
  expect(suggestPeriodBindings(definition(['T1']),periods(['Term 1','Term 1']))).toEqual({});
  expect(suggestPeriodBindings(definition(['Term 1']),periods(['Term 1']).map(p=>({...p,status:'inactive'})))).toEqual({});
});
it('fills missing saved connections but preserves teacher-selected matches',()=>{
  const d=definition(['Term 1','Term 2']),ps=periods(['Term 1','Term 2']);
  expect(completeBindings(d,ps,[],{periodBindings:{period_1:'custom-choice'},subjectBindings:{}}).periodBindings).toEqual({period_1:'custom-choice',period_2:'id-2'});
});
