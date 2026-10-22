module.exports = {id:'qa-water',title:'Wasserkreislauf Regression',subject:'NMG',grade:'5',difficulty:'medium',resourceType:'worksheet',question_count:11,status:'review',created_at:new Date().toISOString(),content:{title:'Wasserkreislauf Regression',teacher_notes:'Gemeinsam besprechen.',total_points:11,questions:[
 {type:'ordering',question:'Ordne die Schritte des Wasserkreislaufs.',answer:['Verdunstung','Kondensation','Niederschlag']},
 {type:'true_false',question:'Wasser verdunstet nur bei hundert Grad.',answer:false,options:['True','False']},
 {type:'multiple_choice',question:'Was entsteht durch Kondensation?',answer:'Wolken',options:['Wolken','Sand','Steine']},
 {type:'open',question:'Beschreibe den Weg des Wassers.',answer:'Das Wasser verdunstet und kondensiert.'},
 {type:'math',question:'Berechne: 10 minus 10 Liter.',answer:0},
 {type:'matching',question:'Ordne die Begriffe richtig zu.',answer:[{left:'Sonne',right:'Energie'},{left:'Regen',right:'Niederschlag'}]},
 {type:'fill_blank',question:'Aus ___ werden ___.',answer:['Wasser','Wolken']},
 {type:'either_or',question:'Ist Wasserdampf gasförmig?',answer:'Ja',options:['Ja','Nein']},
 {type:'image',question:'Beschreibe die Wolke im Bild.',answer:'Eine Wolke besteht aus Wassertröpfchen.'},
 {type:'table',question:'Ergänze die Zustände des Wassers.',answer:'Wasser ist flüssig.',tableHeaders:['Zustand','Beispiel'],tableRows:[['flüssig','Wasser']]},
 {type:'image_block',question:'Bild zum Wasserkreislauf',answer:'',imageSize:'medium',imageAlignment:'center'}
 ].map((q,i)=>({...q,number:i+1,points:1}))}}
