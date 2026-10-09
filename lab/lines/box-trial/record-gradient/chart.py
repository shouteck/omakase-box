"""Standalone research chart using bundled ReportLab charts; no web or models."""
import pathlib,json
from reportlab.graphics.shapes import Drawing,String
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.lib import colors
from reportlab.graphics import renderSVG,renderPDF
HERE=pathlib.Path(__file__).resolve().parent
s=json.loads((HERE/'summary.json').read_bytes());table=s['common_table'];names=['Opus','o3','Qwen3','o4 mini','GPT4.1','Qwen2.5']
d=Drawing(1100,910)
d.add(String(25,882,'Public records: observed room for a failing-test Box',fontName='Helvetica-Bold',fontSize=19))
d.add(String(25,858,f"Search/timed views: {s['common_box_tasks']} common tasks; complete: {s['all_submitted_sensitivity']['never']['tasks'] if s['all_submitted_sensitivity']['never'] else 0}; reading: {s['reading_common_tasks']}",fontSize=12))
blue=colors.HexColor('#195899');orange=colors.HexColor('#bb5820')

def panel(x,y,title,fields,labels,maximum=None,percent=False,rows=None):
 rows=table if rows is None else rows
 d.add(String(x,y+216,title,fontName='Helvetica-Bold',fontSize=12))
 plot=LinePlot();plot.x=x+40;plot.y=y+42;plot.width=440;plot.height=145
 plot.data=[[(i,(100 if percent else 1)*r[field]) for i,r in enumerate(rows) if r.get(field) is not None] for field in fields]
 plot.xValueAxis.valueMin=0;plot.xValueAxis.valueMax=5;plot.xValueAxis.valueSteps=list(range(6));plot.xValueAxis.labelTextFormat=lambda v:names[int(v)] if int(v)==v and 0<=v<=5 else ''
 plot.xValueAxis.labels.fontSize=8;plot.yValueAxis.labels.fontSize=9;plot.yValueAxis.valueMin=0
 if maximum is not None:plot.yValueAxis.valueMax=maximum
 palette=[blue,orange,colors.HexColor('#307444')]
 for i in range(len(fields)):plot.lines[i].strokeColor=palette[i];plot.lines[i].strokeWidth=2
 d.add(plot)
 for i,label in enumerate(labels):d.add(String(x+40,y+20-i*12,label,fontSize=9,fillColor=palette[i]))

panel(25,600,'Steps to first observed fix function (among observed)', ['median_reach_steps','median_broad_steps'],['Explicit view/edit','Also search context visibility'])
panel(565,600,'All-six completed tasks: no observed fix function (%)',['never_recognized_rate','broad_never_visible_rate','neither_timed_nor_submitted_target_rate'],['No timed view/edit','No broad context visibility','Neither timed nor verified submitted edit'],100,True,rows=s['all_submitted_table'])
panel(25,345,'Search opportunities (% of all search actions)',['opportunity_share_all','opportunity_share_upper_all'],['Verified lower bound','Upper bound if all unknown searches are positive'],100,True)
panel(565,345,'First fix-result rank (conditional on visible match)',['median_ordinary_rank','median_box_rank'],['Recorded ordinary order','Box order; visible output only'])
panel(25,90,'Body text removable (% of all returned bytes)',['slice_removable_all_returned_share_median'],['Verified source-byte lower bound; signatures retained'],100,True,rows=s['reading_all_task_table'])
panel(565,90,'Pre-finding opportunity (% of runs)',['pre_reach_opportunity_rate','pre_reach_opportunity_upper_rate'],['Verified lower bound','Upper bound with unknown pre-finding searches'],100,True)
d.add(String(25,46,'Published solve rates: 67.6%, 58.4%, 55.4%, 45.0%, 39.58%, 9.0%; opportunity is not repair benefit.',fontSize=10))
d.add(String(25,27,'Format, API/retry errors, prompts and caps differ. Source-view removal omits formatting and later full-view costs.',fontSize=10))
renderSVG.drawToFile(d,str(HERE/'gradient.svg'));renderPDF.drawToFile(d,str(HERE/'gradient.pdf'))
try:
 import fitz
 doc=fitz.open(HERE/'gradient.pdf');doc[0].get_pixmap(matrix=fitz.Matrix(1.3,1.3)).save(HERE/'gradient.png')
except ImportError:pass
print('Standalone ReportLab SVG/PDF chart written')
