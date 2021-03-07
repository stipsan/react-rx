const fs = require('fs')
import {SearchExample} from './SearchExample'

export default {
  name: 'search',
  component: SearchExample,
  title: 'Search',
  type: 'mixed',
  source: fs.readFileSync(`${__dirname}/SearchExample.tsx`, 'utf-8')
}
