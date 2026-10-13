import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync(':memory:'); d.exec('create table t(a)'); console.log('node:sqlite ok')
