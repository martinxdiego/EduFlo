#pragma once
// Included after the existing event-fixture helpers. No native service/driver,
// ETW session, filesystem mutation or external component is executed here.
inline size_t b2_cases(){
  size_t checks=0;auto test=[&](bool ok){q::require(ok);checks++;};
  auto reject=[&](auto work){bool thrown=false;try{work();}catch(const q::error&){thrown=true;}test(thrown);};
  auto put16=[](std::vector<uint8_t>& bytes,size_t offset,uint16_t v){bytes.at(offset)=uint8_t(v);bytes.at(offset+1)=uint8_t(v>>8);};
  auto put32=[](std::vector<uint8_t>& bytes,size_t offset,uint32_t v){for(size_t i=0;i<4;i++)bytes.at(offset+i)=uint8_t(v>>(8*i));};
  auto reparse=[&](bool symbolic,bool remove){
    const size_t base=symbolic?20:16;std::vector<uint8_t> bytes(remove?8:base+8);
    put32(bytes,0,symbolic?0xa000000cu:0xa0000003u);put16(bytes,4,static_cast<uint16_t>(bytes.size()-8));
    if(!remove){put16(bytes,10,4);put16(bytes,12,4);put16(bytes,14,4);
      put16(bytes,base,'\\');put16(bytes,base+2,'T');put16(bytes,base+4,'P');put16(bytes,base+6,'N');}
    return bytes;
  };
  for(bool symbolic:{false,true})for(bool remove:{false,true}){
    const uint32_t code=remove?0x900acu:0x900a4u;auto bytes=reparse(symbolic,remove);QB_EVENT e{};
    test(QBDecodeReparse(code,bytes.data(),bytes.size(),&e));test(e.reparse_tag==(symbolic?0xa000000cu:0xa0000003u));
    test(remove?e.destination_bytes==0:(e.destination_bytes==4&&e.destination[0]=='\\'&&e.destination[1]=='T'));
    for(size_t length=0;length<bytes.size();length++)test(!QBDecodeReparse(code,bytes.data(),length,&e));
    auto extra=bytes;extra.push_back(0);test(!QBDecodeReparse(code,extra.data(),extra.size(),&e));
    auto bad=bytes;bad[6]=1;test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));
    bad=bytes;put32(bad,0,0xa0000010u);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));
    test(!QBDecodeReparse(0x900a8,bytes.data(),bytes.size(),&e));
    if(!remove){
      for(size_t offset:{8u,10u,12u,14u})for(uint16_t value:{uint16_t(1),uint16_t(0xfffe),uint16_t(0xffff)}){
        bad=bytes;put16(bad,offset,value);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));}
      const size_t base=symbolic?20:16;bad=bytes;put16(bad,base,0);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));
      bad=bytes;put16(bad,base,0xd800);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));
      bad=bytes;put16(bad,base,0xd800);put16(bad,base+2,0xdc00);test(QBDecodeReparse(code,bad.data(),bad.size(),&e));
      bad=bytes;put16(bad,base+6,0xd800);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));
      if(symbolic){bad=bytes;put32(bad,16,1);test(QBDecodeReparse(code,bad.data(),bad.size(),&e)&&e.disposition_flags==1);
        for(unsigned bit=1;bit<32;bit++){put32(bad,16,1u<<bit);test(!QBDecodeReparse(code,bad.data(),bad.size(),&e));}}
    }
  }
  for(uint32_t c:{10u,56u,65u,66u,11u,57u,72u,73u})for(uint32_t pointerBytes:{4u,8u}){
    const size_t offset=2*pointerBytes+4;std::vector<uint8_t> bytes(offset+4);put32(bytes,2*pointerBytes,4);
    put32(bytes,pointerBytes,123);put16(bytes,offset,'D');put16(bytes,offset+2,'F');QB_NAME_INPUT input{};
    test(QBDecodeName(c,bytes.data(),bytes.size(),pointerBytes,&input)&&input.root==123&&input.name_offset==offset&&input.name_bytes==4);
    for(size_t length=0;length<bytes.size();length++)test(!QBDecodeName(c,bytes.data(),length,pointerBytes,&input));
    auto extra=bytes;extra.push_back(0);test(!QBDecodeName(c,extra.data(),extra.size(),pointerBytes,&input));
    for(uint32_t flags:QBExtendedNameClass(c)?std::vector<uint32_t>{1,2,3,0x40,0x80,0x100,0x1ff}:std::vector<uint32_t>{0,1}){
      put32(bytes,0,flags);test(QBDecodeName(c,bytes.data(),bytes.size(),pointerBytes,&input)&&input.flags==flags);
    }
    put32(bytes,0,QBExtendedNameClass(c)?0x200:2);test(!QBDecodeName(c,bytes.data(),bytes.size(),pointerBytes,&input));
    put32(bytes,0,0);put16(bytes,offset,0xd800);test(!QBDecodeName(c,bytes.data(),bytes.size(),pointerBytes,&input));
    put16(bytes,offset,'D');put32(bytes,2*pointerBytes,UINT32_MAX);test(!QBDecodeName(c,bytes.data(),bytes.size(),pointerBytes,&input));
  }
  for(unsigned value=0;value<256;value++){uint8_t input=static_cast<uint8_t>(value);uint32_t flags=0;test(bool(QBDecodeDisposition(13,&input,1,&flags))==(value<=1));}
  for(uint32_t flags=0;flags<512;flags++){std::vector<uint8_t> input(4);put32(input,0,flags);uint32_t output=0;
    test(bool(QBDecodeDisposition(64,input.data(),4,&output))==(flags<=0x1f));
    for(size_t length=0;length<4;length++)test(!QBDecodeDisposition(64,input.data(),length,&output));}
  for(uint32_t c:{56u,65u,66u,57u,72u,73u,64u}){
    const auto kind=c==64?QB_DISPOSITION:(QBRenameClass(c)?QB_RENAME:QB_LINK);auto events=fixture(kind);
    for(size_t i:{5u,6u}){events[i].information_class=c;events[i].disposition_flags=QBExtendedNameClass(c)?0x43:(c==64?0x13:1);}
    // The wire format is supported; successful namespace outcomes still need
    // an independent destination/replacement identity producer. Test rejection
    // of success separately, then verify parsing of an observed failed request.
    if(kind!=QB_DISPOSITION){q::observation_chain unresolved(11);etw(unresolved);reject([&]{for(const auto& e:events)unresolved.event(e);});
      test(unresolved.blocked());events[6].status=static_cast<int32_t>(0xc0000022u);}
    q::observation_chain chain(11);etw(chain);for(const auto& e:events)chain.event(e);chain.etw_finish(0,0,0,true);test(chain.finish(health(events)).complete==1);
  }
  // EOS is a distinct authenticated acknowledgement, not inferred from an
  // empty queue or ordinary port disconnection. Every premature state burns.
  for(uint32_t state:{QB_COLD,QB_CAPTURING,QB_DRAINING,QB_SEALED}){QB_HEALTH h{};h.state=state;QBDisconnected(&h);test(h.blocked&&h.disconnects==1);}
  for(unsigned attack=0;attack<5;attack++){QB_HEALTH h{};test(QBStart(&h,11,100));h.volumes=1;test(QBDrain(&h)&&QBSeal(&h,200));
    switch(attack){case 0:h.pending=1;break;case 1:h.queued=1;break;case 2:h.blocked=1;break;case 3:h.end_time=0;break;case 4:h.state=QB_DRAINING;break;}
    test(!QBEndSession(&h)&&h.blocked);}
  QB_HEALTH sealed{};test(QBStart(&sealed,11,100));sealed.volumes=1;test(QBDrain(&sealed)&&QBSeal(&sealed,200));auto ended=sealed;
  test(QBEndSession(&ended)&&ended.state==QB_ENDED);QBDisconnected(&ended);test(!ended.blocked&&!ended.disconnects&&q::end_receipt_matches(sealed,ended));
  for(unsigned field=0;field<9;field++){auto bad=ended;switch(field){case 0:bad.epoch++;break;case 1:bad.sequence++;break;case 2:bad.start_time++;break;
      case 3:bad.end_time++;break;case 4:bad.volumes++;break;case 5:bad.disconnects++;break;case 6:bad.unloads++;break;case 7:bad.state=QB_SEALED;break;case 8:bad.queued++;break;}
    test(!q::end_receipt_matches(sealed,bad));}
  test(!QBEndSession(&ended)&&ended.blocked);test(!QBStart(&ended,12,300));
  // Old B/v1 must not acquire v2 semantics through the expanded parser.
  {q::observation_chain chain(11);auto events=fixture();events[0].version=1;reject([&]{chain.event(events[0]);});test(chain.blocked());}
  q::rundown_inventory inventory{{3,{2,50,3,60}},{4,{2,50,4,70}},{6,{5,55,6,65}}};
  auto feed=[&](q::target_rundown& state){state.session_observed();state.process(2,50);state.process(5,55);for(const auto& [tid,row]:inventory){(void)tid;state.thread(row);}};
  {q::target_rundown state(inventory);test(!state.ready()&&!state.covered());feed(state);test(state.covered()&&!state.ready());state.confirm(inventory);
    test(state.ready());auto facts=state.evidence();test(facts.processes==2&&facts.threads==3&&facts.digest!=std::array<uint8_t,32>{});
    reject([&]{state.confirm(inventory);});test(!state.ready());}
  for(unsigned attack=0;attack<14;attack++){q::target_rundown state(inventory);auto copy=inventory;
    if(attack!=0)state.session_observed();if(attack!=1)state.process(2,50);state.process(5,55);
    if(attack!=2)state.thread(inventory.at(3));state.thread(inventory.at(4));state.thread(inventory.at(6));
    switch(attack){case 0:case 1:case 2:break;case 3:copy.erase(3);break;case 4:copy.at(3).thread_created++;break;
      case 5:copy.at(3).process_created++;break;case 6:copy.at(3).pid=7;break;case 7:copy.at(3).tid=8;break;
      case 8:copy.emplace(9,q::rundown_thread{2,50,9,80});break;case 9:state.fail();break;
      case 10:reject([&]{state.thread(inventory.at(3));});break;case 11:reject([&]{state.process(2,50);});break;
      case 12:reject([&]{state.process(2,51);});break;case 13:reject([&]{state.thread({2,50,3,61});});break;}
    reject([&]{state.confirm(copy);});test(!state.ready());reject([&]{state.evidence();});}
  {auto bad=inventory;bad.at(4).process_created=51;reject([&]{q::target_rundown state(bad);});}
  {auto bad=inventory;bad.at(4).thread_created=1;reject([&]{q::target_rundown state(bad);});}
  {reject([&]{q::target_rundown state({});});}
  std::printf("B2 focused checks: %zu passed, 0 failed; native acquisition NOT_PERFORMED\n",checks);return checks;
}
